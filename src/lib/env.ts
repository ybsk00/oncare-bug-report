export interface Env {
  convexUrl: string;
  serverSecret: string;
  adminPassword: string;
  sessionSecret: string;
}

function required(src: Record<string, string | undefined>, key: string): string {
  const v = src[key];
  if (!v) throw new Error(`환경변수 ${key} 가 없습니다.`);
  return v;
}

/**
 * 비밀값이 브라우저 번들로 새어나가는 최악의 사고를 **부팅 시점에** 막는다.
 * NEXT_PUBLIC_ 접두사가 붙은 비밀값이 하나라도 있으면 즉시 죽인다.
 */
export function readEnv(src: Record<string, string | undefined>): Env {
  for (const k of Object.keys(src)) {
    if (k.startsWith('NEXT_PUBLIC_') && /SECRET|PASSWORD/.test(k)) {
      throw new Error(`${k} — 비밀값에 NEXT_PUBLIC_ 접두사를 붙이면 브라우저로 노출됩니다.`);
    }
  }
  const sessionSecret = required(src, 'SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('환경변수 SESSION_SECRET 은 32자 이상이어야 합니다.');

  return {
    convexUrl: required(src, 'CONVEX_URL'),
    serverSecret: required(src, 'SERVER_SECRET'),
    adminPassword: required(src, 'ADMIN_PASSWORD'),
    sessionSecret,
  };
}
