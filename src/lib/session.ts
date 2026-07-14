import { SignJWT, jwtVerify } from 'jose';

export const ADMIN_COOKIE = 'oncocare_admin';

/** 게시글별 열람 쿠키 이름. 이 쿠키가 있어야 이미지 프록시가 바이트를 내준다. */
export const unlockCookieName = (reportId: string) => `unlock_${reportId}`;

const ADMIN_TTL_SEC = 60 * 60 * 12; // 12시간
const UNLOCK_TTL_SEC = 60 * 10; // 10분

const key = (secret: string) => new TextEncoder().encode(secret);

async function sign(payload: Record<string, unknown>, secret: string, ttlSec: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(key(secret));
}

export const ADMIN_MAX_AGE = ADMIN_TTL_SEC;
export const UNLOCK_MAX_AGE = UNLOCK_TTL_SEC;

export async function signAdminToken(secret: string): Promise<string> {
  return sign({ role: 'admin' }, secret, ADMIN_TTL_SEC);
}

export async function verifyAdminToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * 비번을 맞힌 사람에게만 발급한다. 게시글 id 를 토큰 안에 박아,
 * 한 글의 쿠키를 다른 글에 재사용할 수 없게 한다.
 * `master`(마스터 비번으로 연 세션)만 삭제 권한을 가진다 — 작성자 비번으로는 열람·수정만.
 */
export async function signUnlockToken(reportId: string, secret: string, master = false): Promise<string> {
  return sign({ role: 'unlock', reportId, master }, secret, UNLOCK_TTL_SEC);
}

export async function verifyUnlockToken(
  token: string | undefined,
  reportId: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.role === 'unlock' && payload.reportId === reportId;
  } catch {
    return false;
  }
}

/** 삭제 전용 검사 — 마스터 비번으로 발급된 열람 토큰만 통과한다. */
export async function verifyMasterUnlockToken(
  token: string | undefined,
  reportId: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.role === 'unlock' && payload.reportId === reportId && payload.master === true;
  } catch {
    return false;
  }
}
