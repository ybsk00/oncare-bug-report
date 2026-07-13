import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertServer } from './guard';
import { platformValidator, statusValidator } from './schema';

/** 제출: IP당 10분에 3건 / 열람 시도: IP당 1분에 5회 */
const RATE_RULES = {
  submit: { max: 3, windowMs: 600_000 },
  unlock: { max: 5, windowMs: 60_000 },
} as const;

/**
 * 레이트리밋 확인 + 기록을 **하나의 mutation 안에서** 처리한다.
 * 조회와 기록을 나누면 그 사이에 동시 요청이 끼어들어 한도를 넘긴다.
 * @returns true = 차단
 */
export const rateCheck = mutation({
  args: {
    secret: v.string(),
    ip: v.string(),
    action: v.union(v.literal('submit'), v.literal('unlock')),
  },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const rule = RATE_RULES[args.action];
    const now = Date.now();
    const cutoff = now - rule.windowMs;

    const recent = await ctx.db
      .query('rateLimit')
      .withIndex('by_ip_action', (q) => q.eq('ip', args.ip).eq('action', args.action))
      .collect();

    const inWindow = recent.filter((r) => r.at > cutoff);
    if (inWindow.length >= rule.max) return true;

    await ctx.db.insert('rateLimit', { ip: args.ip, action: args.action, at: now });

    // 윈도 밖 기록은 청소한다 (임시 도구라 별도 크론을 두지 않는다)
    for (const r of recent) {
      if (r.at <= cutoff) await ctx.db.delete(r._id);
    }
    return false;
  },
});

export const create = mutation({
  args: {
    secret: v.string(),
    department: v.string(),
    reporterName: v.string(),
    title: v.string(),
    body: v.string(),
    passwordHash: v.string(),
    imageIds: v.array(v.id('_storage')),
    appVersion: v.optional(v.string()),
    platform: v.optional(platformValidator),
    deviceModel: v.optional(v.string()),
    createdIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const { secret: _secret, ...rest } = args;

    // seq 채번 — 마지막 행의 seq + 1. mutation 은 직렬화되므로 경합이 없다.
    const last = await ctx.db.query('bugReports').withIndex('by_seq').order('desc').first();
    const seq = (last?.seq ?? 0) + 1;

    return await ctx.db.insert('bugReports', { ...rest, seq, status: '접수' });
  },
});

/** 목록 — 본문·비번해시·이미지·IP 는 절대 내보내지 않는다. */
export const list = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const rows = await ctx.db.query('bugReports').withIndex('by_seq').order('desc').take(300);
    return rows.map((r) => ({
      id: r._id,
      seq: r.seq,
      department: r.department,
      reporterName: r.reporterName,
      title: r.title,
      status: r.status,
      createdAt: r._creationTime,
    }));
  },
});

/** 비번 검증용. 해시는 서버(Next.js)에서만 비교하고 응답에 담지 않는다. */
export const getForUnlock = query({
  args: { secret: v.string(), id: v.id('bugReports') },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const r = await ctx.db.get(args.id);
    if (!r) return null;
    return {
      passwordHash: r.passwordHash,
      body: r.body,
      imageCount: r.imageIds.length,
      status: r.status,
      adminNote: r.adminNote ?? null,
      appVersion: r.appVersion ?? null,
      platform: r.platform ?? null,
      deviceModel: r.deviceModel ?? null,
      title: r.title,
      department: r.department,
      reporterName: r.reporterName,
    };
  },
});

/** 이미지 프록시가 index → storageId 를 찾을 때 쓴다. */
export const getImageId = query({
  args: { secret: v.string(), id: v.id('bugReports'), index: v.number() },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const r = await ctx.db.get(args.id);
    if (!r) return null;
    return r.imageIds[args.index] ?? null;
  },
});

export const listForAdmin = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const rows = await ctx.db.query('bugReports').withIndex('by_seq').order('desc').collect();
    return rows.map((r) => ({
      id: r._id,
      seq: r.seq,
      department: r.department,
      reporterName: r.reporterName,
      title: r.title,
      body: r.body,
      imageCount: r.imageIds.length,
      status: r.status,
      adminNote: r.adminNote ?? null,
      appVersion: r.appVersion ?? null,
      platform: r.platform ?? null,
      deviceModel: r.deviceModel ?? null,
      createdAt: r._creationTime,
    }));
  },
});

/** 작성자 수정 — 비밀번호 확인은 Next.js(unlock 쿠키)가 이미 끝냈다. */
export const updateByOwner = mutation({
  args: {
    secret: v.string(),
    id: v.id('bugReports'),
    title: v.string(),
    body: v.string(),
    platform: v.optional(platformValidator),
    /** 남길 기존 이미지의 인덱스. 여기 없는 기존 이미지는 저장소에서도 지운다. */
    keepIndexes: v.array(v.number()),
    newImageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const r = await ctx.db.get(args.id);
    if (!r) throw new Error('없는 글입니다.');

    const keep = r.imageIds.filter((_, i) => args.keepIndexes.includes(i));
    const imageIds = [...keep, ...args.newImageIds];
    if (imageIds.length > 3) throw new Error('이미지는 최대 3장까지 첨부할 수 있습니다.');

    // 떨어져 나간 이미지는 파일까지 지운다 — 안 지우면 저장소에 영원히 남는다.
    for (const id of r.imageIds) {
      if (!keep.includes(id)) await ctx.storage.delete(id);
    }

    await ctx.db.patch(args.id, {
      title: args.title,
      body: args.body,
      platform: args.platform,
      imageIds,
    });
  },
});

/** 작성자·관리자 삭제. 첨부 파일도 함께 지운다. */
export const remove = mutation({
  args: { secret: v.string(), id: v.id('bugReports') },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const r = await ctx.db.get(args.id);
    if (!r) return;
    for (const id of r.imageIds) await ctx.storage.delete(id);
    await ctx.db.delete(args.id);
  },
});

export const patch = mutation({
  args: {
    secret: v.string(),
    id: v.id('bugReports'),
    status: v.optional(statusValidator),
    adminNote: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    const patchData: Record<string, unknown> = {};
    if (args.status !== undefined) patchData.status = args.status;
    if (args.adminNote !== undefined) patchData.adminNote = args.adminNote ?? undefined;
    if (Object.keys(patchData).length === 0) return;
    await ctx.db.patch(args.id, patchData);
  },
});
