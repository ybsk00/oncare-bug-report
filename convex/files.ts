import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertServer } from './guard';

/**
 * 서버(Next.js)가 이미지 바이트를 POST 할 1회용 업로드 URL.
 * 브라우저에 주지 않는다 — 매직바이트 검증을 서버에서 먼저 하기 때문이다.
 */
export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * storageId → Convex 파일 URL.
 *
 * ★ 이 URL 은 **공개이며 만료가 없다.** 절대 브라우저로 내려보내지 않는다.
 *   Next.js 의 /api/image 프록시가 서버에서만 이 URL 로 바이트를 받아 스트리밍한다.
 */
export const getUrl = query({
  args: { secret: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    assertServer(args.secret);
    return await ctx.storage.getUrl(args.storageId);
  },
});
