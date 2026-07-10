import { describe, it, expect } from 'vitest';
import { readEnv } from './env';

const full = {
  CONVEX_URL: 'https://abundant-retriever-951.convex.cloud',
  SERVER_SECRET: 'svc',
  ADMIN_PASSWORD: 'adminpw',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('readEnv', () => {
  it('전부 있으면 읽는다', () => {
    expect(readEnv(full).convexUrl).toBe('https://abundant-retriever-951.convex.cloud');
  });

  it.each(Object.keys(full))('%s 누락 시 즉시 실패 — 조용히 부팅되면 안 된다', (k) => {
    const partial = { ...full } as Record<string, string | undefined>;
    delete partial[k];
    expect(() => readEnv(partial)).toThrow(new RegExp(k));
  });

  it('SESSION_SECRET 은 32자 이상', () => {
    expect(() => readEnv({ ...full, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it('★ 비밀값에 NEXT_PUBLIC_ 을 붙이면 거부한다 (브라우저 노출 사고 차단)', () => {
    expect(() => readEnv({ ...full, NEXT_PUBLIC_SERVER_SECRET: 'leak' })).toThrow(/NEXT_PUBLIC_/);
    expect(() => readEnv({ ...full, NEXT_PUBLIC_ADMIN_PASSWORD: 'leak' })).toThrow(/NEXT_PUBLIC_/);
  });

  it('비밀값이 아닌 NEXT_PUBLIC_ 변수는 허용', () => {
    expect(() => readEnv({ ...full, NEXT_PUBLIC_SITE_NAME: 'oncocare' })).not.toThrow();
  });
});
