import bcrypt from 'bcryptjs';

const COST = 10;

/** 게시글 전용 비번을 해시한다. 평문은 어디에도 저장하지 않는다. */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error('비밀번호가 비어 있습니다.');
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * 개발자 마스터 비번 — 어느 글이든 이 비번으로 열람·수정·삭제할 수 있다(개발자 확인용).
 * 값은 환경변수(MASTER_PASSWORD)에만 둔다. 소스에 박으면 공개 저장소로 그대로 새어나간다.
 * 길이가 다르면 즉시 false — 그래서 타이밍 공격 방어는 길이가 같을 때만 의미가 있다.
 */
export function isMasterPassword(plain: string, master: string | undefined): boolean {
  if (!master || !plain || plain.length !== master.length) return false;
  let diff = 0;
  for (let i = 0; i < master.length; i += 1) diff |= plain.charCodeAt(i) ^ master.charCodeAt(i);
  return diff === 0;
}
