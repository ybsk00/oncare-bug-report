import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';
import { getConvex, env } from '@/lib/convex';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/session';
import { adminPatchSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { serverSecret, sessionSecret } = env();
  if (!(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, sessionSecret))) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const parsed = adminPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });

  await getConvex().mutation(api.reports.patch, {
    secret: serverSecret,
    id: params.id as Id<'bugReports'>,
    status: parsed.data.status,
    adminNote: parsed.data.adminNote,
  });

  return new NextResponse(null, { status: 204 });
}
