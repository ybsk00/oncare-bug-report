import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { getConvex, env } from '@/lib/convex';
import { getClientIp } from '@/lib/ip';
import { isMasterPassword, verifyPassword } from '@/lib/password';
import { signUnlockToken, unlockCookieName, UNLOCK_MAX_AGE } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * ★ 실패 응답은 항상 같다.
 *   "글이 없다"와 "비번이 틀리다"를 구분해 주면 그 글의 존재 여부가 새어나간다.
 */
const deny = () => NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { serverSecret, sessionSecret, masterPassword } = env();
  const convex = getConvex();

  const ip = getClientIp(req.headers);
  if (!ip) return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 400 });

  const limited = await convex.mutation(api.reports.rateCheck, { secret: serverSecret, ip, action: 'unlock' });
  if (limited) {
    return NextResponse.json({ error: '시도가 너무 잦습니다. 1분 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password) return deny();

  // ★ id 형식이 잘못되면 Convex 가 예외를 던져 500 이 나간다. 그러면 "없는 글=500,
  //   있는 글=401" 로 갈려 **상태코드만으로 글의 존재 여부가 새어나간다.**
  //   조회 실패는 전부 401 로 눌러 담는다.
  const r = await convex
    .query(api.reports.getForUnlock, { secret: serverSecret, id: params.id as Id<'bugReports'> })
    .catch(() => null);

  if (!r) return deny();

  // 개발자 마스터 비번이면 글 비번을 몰라도 연다(신고 내역 확인용).
  // 존재하지 않는 글에는 통하지 않는다 — 위의 조회 실패는 이미 401 로 눌러 담았다.
  const master = isMasterPassword(password, masterPassword);
  if (!master && !(await verifyPassword(password, r.passwordHash))) return deny();

  const res = NextResponse.json({
    // 삭제는 마스터 세션에서만 가능 — 화면이 이 값으로 삭제 버튼을 숨긴다.
    canDelete: master,
    title: r.title,
    department: r.department,
    reporterName: r.reporterName,
    body: r.body,
    imageCount: r.imageCount,
    status: r.status,
    adminNote: r.adminNote,
    appVersion: r.appVersion,
    platform: r.platform,
    deviceModel: r.deviceModel,
  });

  // 이미지 프록시가 이 쿠키를 확인한다. 이미지 URL 자체는 브라우저에 나가지 않는다.
  res.cookies.set(unlockCookieName(params.id), await signUnlockToken(params.id, sessionSecret, master), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: UNLOCK_MAX_AGE,
  });
  return res;
}
