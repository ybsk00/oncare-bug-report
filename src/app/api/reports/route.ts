import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { getConvex, env } from '@/lib/convex';
import { getClientIp } from '@/lib/ip';
import { hashPassword } from '@/lib/password';
import { reportInputSchema } from '@/lib/schema';
import { validateImages, sniffImageType } from '@/lib/imageValidate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { serverSecret } = env();
  const convex = getConvex();

  // IP 를 모르면 차단한다 — 조용히 통과시키면 레이트리밋이 무력해진다.
  const ip = getClientIp(req.headers);
  if (!ip) return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 400 });

  const limited = await convex.mutation(api.reports.rateCheck, { secret: serverSecret, ip, action: 'submit' });
  if (limited) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요. (10분에 3건까지)' }, { status: 429 });
  }

  const form = await req.formData();

  // honeypot — 사람에겐 보이지 않는 필드. 채워져 있으면 봇이다.
  if ((form.get('website') as string | null)?.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const parsed = reportInputSchema.safeParse({
    department: form.get('department'),
    reporterName: form.get('reporterName'),
    title: form.get('title'),
    body: form.get('body'),
    password: form.get('password'),
    appVersion: form.get('appVersion') || undefined,
    platform: form.get('platform') || undefined,
    deviceModel: form.get('deviceModel') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });

  const blobs = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  const loaded = await Promise.all(
    blobs.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), size: f.size })),
  );
  const check = validateImages(loaded);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // 원본 파일명은 버린다 — 파일명에 환자 이름이 들어 있을 수 있다.
  const imageIds: Id<'_storage'>[] = [];
  for (const item of loaded) {
    const kind = sniffImageType(item.bytes)!;
    const uploadUrl = await convex.mutation(api.files.generateUploadUrl, { secret: serverSecret });
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': kind },
      body: item.bytes,
    });
    if (!res.ok) return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
    const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
    imageIds.push(storageId);
  }

  const id = await convex.mutation(api.reports.create, {
    secret: serverSecret,
    department: parsed.data.department,
    reporterName: parsed.data.reporterName,
    title: parsed.data.title,
    body: parsed.data.body,
    passwordHash: await hashPassword(parsed.data.password),
    imageIds,
    appVersion: parsed.data.appVersion,
    platform: parsed.data.platform,
    deviceModel: parsed.data.deviceModel,
    createdIp: ip,
  });

  return NextResponse.json({ id }, { status: 201 });
}

/** 목록 — 본문·이미지·비번은 절대 내려보내지 않는다. */
export async function GET() {
  const { serverSecret } = env();
  const items = await getConvex().query(api.reports.list, { secret: serverSecret });
  return NextResponse.json({ items });
}
