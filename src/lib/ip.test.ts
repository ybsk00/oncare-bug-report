import { describe, it, expect } from 'vitest';
import { getClientIp } from './ip';

const h = (o: Record<string, string>) => new Headers(o);

describe('getClientIp', () => {
  it('x-forwarded-for 의 첫 IP (Vercel 프록시 체인)', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });

  it('공백을 제거한다', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '  5.6.7.8  ' }))).toBe('5.6.7.8');
  });

  it('x-real-ip 폴백', () => {
    expect(getClientIp(h({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('헤더가 없으면 null — 호출부가 차단으로 판단한다', () => {
    expect(getClientIp(h({}))).toBeNull();
  });
});
