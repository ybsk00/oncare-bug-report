/**
 * Vercel 은 x-forwarded-for 에 "클라이언트, 프록시1, 프록시2" 형태로 쌓는다.
 * 맨 앞이 실제 클라이언트다. 헤더가 없으면 null 을 돌려주고, 호출부가 판단한다
 * (IP 를 모른다고 조용히 통과시키면 레이트리밋이 무력해진다).
 */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}
