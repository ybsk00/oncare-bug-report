import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../convex/_generated/api';
import { getConvex, env } from '@/lib/convex';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { serverSecret, sessionSecret } = env();
  if (!(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, sessionSecret))) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const items = await getConvex().query(api.reports.listForAdmin, { secret: serverSecret });
  return NextResponse.json({ items });
}
