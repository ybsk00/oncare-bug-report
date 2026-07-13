import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isMasterPassword } from './password';

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

describe('개발자 마스터 비번', () => {
  const MASTER = 'lumi1234';

  it('마스터 비번은 통과한다', () => {
    expect(isMasterPassword(MASTER, MASTER)).toBe(true);
  });

  it('다른 비번은 통과하지 못한다', () => {
    expect(isMasterPassword('lumi1235', MASTER)).toBe(false);
    expect(isMasterPassword('LUMI1234', MASTER)).toBe(false); // 대소문자 구분
    expect(isMasterPassword('lumi123', MASTER)).toBe(false);
    expect(isMasterPassword('lumi12345', MASTER)).toBe(false);
  });

  // ★ 환경변수가 없는 배포에서 빈 문자열이 마스터로 통해 버리면 전 글이 뚫린다.
  it('마스터 비번이 설정돼 있지 않으면 무엇으로도 열리지 않는다', () => {
    expect(isMasterPassword('', undefined)).toBe(false);
    expect(isMasterPassword('아무거나', undefined)).toBe(false);
    expect(isMasterPassword('', '')).toBe(false);
    expect(isMasterPassword('아무거나', '')).toBe(false);
  });

  it('빈 입력은 통과하지 못한다', () => {
    expect(isMasterPassword('', MASTER)).toBe(false);
  });
});
