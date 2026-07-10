import { describe, it, expect } from 'vitest';
import { reportInputSchema, adminPatchSchema } from './schema';

const base = {
  department: '간호부',
  reporterName: '홍길동',
  title: '로그인 후 앱이 종료됩니다',
  body: '로그인 버튼을 누르면 즉시 앱이 꺼집니다.',
  password: 'pw1234',
};

describe('reportInputSchema', () => {
  it('필수 필드만 있으면 통과', () => {
    expect(reportInputSchema.safeParse(base).success).toBe(true);
  });

  it('선택 필드(앱버전·OS·기기) 허용', () => {
    const r = reportInputSchema.safeParse({ ...base, appVersion: '1.0.3', platform: 'iOS', deviceModel: 'iPhone 14' });
    expect(r.success).toBe(true);
  });

  it.each(['department', 'reporterName', 'title', 'body', 'password'])('%s 누락 시 실패', (k) => {
    const bad: Record<string, unknown> = { ...base };
    delete bad[k];
    expect(reportInputSchema.safeParse(bad).success).toBe(false);
  });

  it('비번은 4자 이상', () => {
    expect(reportInputSchema.safeParse({ ...base, password: 'abc' }).success).toBe(false);
  });

  it('platform 은 iOS/Android 만', () => {
    expect(reportInputSchema.safeParse({ ...base, platform: 'Windows' }).success).toBe(false);
  });

  it('제목 200자·본문 5000자 초과 거부', () => {
    expect(reportInputSchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...base, body: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('공백만 있는 이름은 거부', () => {
    expect(reportInputSchema.safeParse({ ...base, reporterName: '   ' }).success).toBe(false);
  });
});

describe('adminPatchSchema', () => {
  it('상태 4종만 허용', () => {
    expect(adminPatchSchema.safeParse({ status: '수정완료' }).success).toBe(true);
    expect(adminPatchSchema.safeParse({ status: '보류' }).success).toBe(false);
  });

  it('답변은 null 로 지울 수 있다', () => {
    expect(adminPatchSchema.safeParse({ adminNote: null }).success).toBe(true);
  });
});
