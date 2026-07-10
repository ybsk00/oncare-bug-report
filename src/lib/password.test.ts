import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('해시는 평문을 담지 않는다', async () => {
    const hash = await hashPassword('mypw1234');
    expect(hash).not.toContain('mypw1234');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('같은 평문도 매번 다른 해시 (salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('맞는 비번은 통과, 틀린 비번은 거부', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('correct', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('빈 비번은 해시하지 않는다', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  it('빈 값·빈 해시로는 검증 통과가 불가능하다', async () => {
    expect(await verifyPassword('', 'x')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});
