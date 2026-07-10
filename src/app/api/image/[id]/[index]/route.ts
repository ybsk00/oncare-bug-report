import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { getConvex, env } from '@/lib/convex';
import {
  ADMIN_COOKIE, unlockCookieName, verifyAdminToken, verifyUnlockToken,
} from '@/lib/session';

export const runtime = 'nodejs';

/**
 * 이미지 프록시 (2026-07-10)
 *
 * Convex 의 `storage.getUrl()` 은 **공개이며 만료가 없다.** 그 URL 을 브라우저에 주면
 * 한 번 새어나간 링크가 영원히 산다. 그래서 서버가 대신 받아서 스트리밍한다.
 *
 * - 이미지 URL 은 브라우저에 한 번도 노출되지 않는다 (signed URL 보다 강하다).
 * - 요청마다 열람 쿠키(그 글 전용) 또는 관리자 쿠키를 확인한다.
 * - `?download=1` 이면 첨부 파일로 내려받는다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; index: string } },
) {
  const { serverSecret, sessionSecret } = env();

  const isAdmin = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, sessionSecret);
  const isUnlocked = await verifyUnlockToken(
    req.cookies.get(unlockCookieName(params.id))?.value,
    params.id,
    sessionSecret,
  );
  if (!isAdmin && !isUnlocked) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const convex = getConvex();
  // 잘못된 id 형식은 Convex 가 throw 한다 → 500 대신 404 로 눌러 담는다.
  const storageId = await convex
    .query(api.reports.getImageId, { secret: serverSecret, id: params.id as Id<'bugReports'>, index })
    .catch(() => null);
  if (!storageId) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });

  const url = await convex
    .query(api.files.getUrl, { secret: serverSecret, storageId })
    .catch(() => null);
  if (!url) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: '이미지를 불러오지 못했습니다.' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const ext = contentType.split('/')[1] ?? 'bin';
  const download = req.nextUrl.searchParams.get('download') === '1';

  const headers = new Headers({
    'content-type': contentType,
    // 캐시하지 않는다 — 쿠키가 만료된 뒤에도 브라우저 캐시에서 보이면 안 된다.
    'cache-control': 'private, no-store',
  });
  if (download) {
    headers.set('content-disposition', `attachment; filename="bug-${params.id}-${index + 1}.${ext}"`);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
