/**
 * Convex 함수 보호 (2026-07-10)
 *
 * `fetchQuery`/`fetchMutation`(convex/nextjs)은 **public 함수만** 부를 수 있다.
 * 그런데 배포 URL 을 아는 사람은 누구나 public 함수를 호출할 수 있다.
 *
 * → 모든 함수의 첫 인자로 `secret` 을 받고, Convex 환경변수 `SERVER_SECRET` 과
 *   다르면 즉시 throw 한다. 이 시크릿은 Next.js 서버에만 있고 브라우저로 내려가지 않는다.
 *
 * 이게 이 프로젝트의 유일한 인가 계층이다. 함수를 새로 만들 때 반드시 첫 줄에서 부를 것.
 */
export function assertServer(secret: string): void {
  const expected = process.env.SERVER_SECRET;
  if (!expected) throw new Error('SERVER_SECRET 이 Convex 환경변수에 설정되지 않았습니다.');
  if (secret !== expected) throw new Error('Unauthorized');
}
