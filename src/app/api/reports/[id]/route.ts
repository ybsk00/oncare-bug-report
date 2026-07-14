import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { getConvex, env } from '@/lib/convex';
import {
  ADMIN_COOKIE, unlockCookieName, verifyAdminToken, verifyMasterUnlockToken, verifyUnlockToken,
} from '@/lib/session';
import { reportEditSchema } from '@/lib/schema';
import { validateImages, sniffImageType } from '@/lib/imageValidate';

export const runtime = 'nodejs';

/**
 * 수정·삭제 권한 = 비밀번호를 맞혀 받은 열람 쿠키(unlock, 10분) 또는 관리자 쿠키.
 * 비밀번호 자체는 다시 받지 않는다 — 열람 단계에서 이미 검증됐고, 그 쿠키에 글 id가 박혀 있다.
 */
async function authorize(req: NextRequest, id: string): Promise<boolean> {
  const { sessionSecret } = env();
  if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, sessionSecret)) return true;
  return verifyUnlockToken(req.cookies.get(unlockCookieName(id))?.value, id, sessionSecret);
}

const denied = () =>
  NextResponse.json({ error: '권한이 없습니다. 비밀번호를 다시 입력해 주세요.' }, { status: 401 });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { serverSecret } = env();
  if (!(await authorize(req, params.id))) return denied();

  const form = await req.formData();
  const parsed = reportEditSchema.safeParse({
    title: form.get('title'),
    body: form.get('body'),
    platform: form.get('platform') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });

  // 남길 기존 이미지 인덱스. 값이 이상하면 통째로 거부한다(무언의 이미지 삭제 방지).
  let keepIndexes: number[];
  try {
    const raw: unknown = JSON.parse((form.get('keepIndexes') as string | null) ?? '[]');
    if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && (n as number) >= 0)) throw new Error();
    keepIndexes = raw as number[];
  } catch {
    return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });
  }

  const blobs = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  const loaded = await Promise.all(
    blobs.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), size: f.size })),
  );
  const check = validateImages(loaded);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  if (keepIndexes.length + loaded.length > 3) {
    return NextResponse.json({ error: '이미지는 최대 3장까지 첨부할 수 있습니다.' }, { status: 400 });
  }

  const convex = getConvex();

  // 원본 파일명은 버린다 — 파일명에 환자 이름이 들어 있을 수 있다(등록 경로와 동일).
  const newImageIds: Id<'_storage'>[] = [];
  for (const item of loaded) {
    const kind = sniffImageType(item.bytes)!;
    const uploadUrl = await convex.mutation(api.files.generateUploadUrl, { secret: serverSecret });
    const res = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': kind }, body: item.bytes });
    if (!res.ok) return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
    newImageIds.push(storageId);
  }

  try {
    await convex.mutation(api.reports.updateByOwner, {
      secret: serverSecret,
      id: params.id as Id<'bugReports'>,
      title: parsed.data.title,
      body: parsed.data.body,
      platform: parsed.data.platform,
      keepIndexes,
      newImageIds,
    });
  } catch {
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * 삭제 권한 = 관리자 쿠키 또는 **마스터 비번으로 연** 열람 쿠키.
 * 작성자 비번 세션으로는 지울 수 없다 — 2026-07-14 실신고 10건이 작성자 삭제로
 * 전량 유실된 뒤(백업 없음 → 복구 불가) 삭제를 개발자 전용으로 좁혔다.
 */
async function authorizeDelete(req: NextRequest, id: string): Promise<boolean> {
  const { sessionSecret } = env();
  if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, sessionSecret)) return true;
  return verifyMasterUnlockToken(req.cookies.get(unlockCookieName(id))?.value, id, sessionSecret);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { serverSecret } = env();
  if (!(await authorizeDelete(req, params.id))) {
    return NextResponse.json(
      { error: '작성자는 글을 삭제할 수 없습니다. 삭제가 필요하면 개발팀에 요청해 주세요.' },
      { status: 403 },
    );
  }

  // 실패를 삼키면 안 된다 — 삭제되지 않았는데 204 를 주면 화면은 "삭제됨"으로 보인다.
  try {
    await getConvex().mutation(api.reports.remove, {
      secret: serverSecret,
      id: params.id as Id<'bugReports'>,
    });
  } catch {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(unlockCookieName(params.id));
  return res;
}
