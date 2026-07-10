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
