import { describe, it, expect } from 'vitest';
import {
  ADMIN_COOKIE, unlockCookieName,
  signAdminToken, verifyAdminToken,
  signUnlockToken, verifyMasterUnlockToken, verifyUnlockToken,
} from './session';

const SECRET = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

describe('admin session', () => {
  it('쿠키 이름이 고정되어 있다', () => {
    expect(ADMIN_COOKIE).toBe('oncocare_admin');
  });

  it('서명한 토큰은 검증을 통과', async () => {
    expect(await verifyAdminToken(await signAdminToken(SECRET), SECRET)).toBe(true);
  });

  it('다른 시크릿으로는 검증 실패 — 위조 차단', async () => {
    expect(await verifyAdminToken(await signAdminToken(SECRET), OTHER)).toBe(false);
  });

  it('토큰이 없거나 깨졌으면 실패', async () => {
    expect(await verifyAdminToken(undefined, SECRET)).toBe(false);
    expect(await verifyAdminToken('garbage', SECRET)).toBe(false);
  });
});

describe('unlock session', () => {
  it('쿠키 이름은 게시글별로 다르다', () => {
    expect(unlockCookieName('abc')).toBe('unlock_abc');
    expect(unlockCookieName('abc')).not.toBe(unlockCookieName('def'));
  });

  it('그 글의 토큰은 그 글에서만 통한다', async () => {
    const t = await signUnlockToken('report-1', SECRET);
    expect(await verifyUnlockToken(t, 'report-1', SECRET)).toBe(true);
  });

  it('★ 한 글의 열람 쿠키를 다른 글에 재사용할 수 없다', async () => {
    const t = await signUnlockToken('report-1', SECRET);
    expect(await verifyUnlockToken(t, 'report-2', SECRET)).toBe(false);
  });

  it('관리자 토큰을 열람 토큰으로 쓸 수 없다 (role 검사)', async () => {
    const admin = await signAdminToken(SECRET);
    expect(await verifyUnlockToken(admin, 'report-1', SECRET)).toBe(false);
  });

  it('열람 토큰을 관리자 토큰으로 쓸 수 없다', async () => {
    const unlock = await signUnlockToken('report-1', SECRET);
    expect(await verifyAdminToken(unlock, SECRET)).toBe(false);
  });
});

describe('master unlock (삭제 권한)', () => {
  it('★ 작성자 비번 토큰으로는 삭제 검사를 통과할 수 없다', async () => {
    const author = await signUnlockToken('report-1', SECRET);
    expect(await verifyUnlockToken(author, 'report-1', SECRET)).toBe(true); // 열람은 되지만
    expect(await verifyMasterUnlockToken(author, 'report-1', SECRET)).toBe(false); // 삭제는 안 된다
  });

  it('마스터 토큰은 삭제 검사를 통과한다 (열람도 그대로)', async () => {
    const master = await signUnlockToken('report-1', SECRET, true);
    expect(await verifyMasterUnlockToken(master, 'report-1', SECRET)).toBe(true);
    expect(await verifyUnlockToken(master, 'report-1', SECRET)).toBe(true);
  });

  it('마스터 토큰도 다른 글에는 통하지 않는다', async () => {
    const master = await signUnlockToken('report-1', SECRET, true);
    expect(await verifyMasterUnlockToken(master, 'report-2', SECRET)).toBe(false);
  });

  it('다른 시크릿·깨진 토큰·관리자 토큰은 전부 실패', async () => {
    const master = await signUnlockToken('report-1', SECRET, true);
    expect(await verifyMasterUnlockToken(master, 'report-1', OTHER)).toBe(false);
    expect(await verifyMasterUnlockToken('garbage', 'report-1', SECRET)).toBe(false);
    expect(await verifyMasterUnlockToken(await signAdminToken(SECRET), 'report-1', SECRET)).toBe(false);
  });
});
