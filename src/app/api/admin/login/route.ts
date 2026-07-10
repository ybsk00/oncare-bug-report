import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/convex';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, signAdminToken } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { adminPassword, sessionSecret } = env();
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!password || password !== adminPassword) {
    return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(ADMIN_COOKIE, await signAdminToken(sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_MAX_AGE,
  });
  return res;
}
