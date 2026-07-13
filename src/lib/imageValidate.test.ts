import { describe, it, expect } from 'vitest';
import { sniffImageType, validateImages, MAX_IMAGE_BYTES } from './imageValidate';

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = () => {
  const b = new Uint8Array(12);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return b;
};
const gif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const file = (bytes: Uint8Array, size = bytes.length) => ({ bytes, size });

describe('sniffImageType', () => {
  it('jpeg/png/webp 를 바이트로 판별', () => {
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(webp())).toBe('image/webp');
  });

  it('★ .jpg 로 위장한 gif 도 거부 — 확장자를 믿지 않는다', () => {
    expect(sniffImageType(gif())).toBeNull();
  });

  it('빈 바이트는 null', () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it('RIFF 로 시작해도 WEBP 가 아니면 거부 (wav 등)', () => {
    const wav = new Uint8Array(12);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe('validateImages', () => {
  it('이미지 1장은 통과', () => {
    expect(validateImages([file(png())])).toEqual({ ok: true });
  });

  // 정책 변경(2026-07-13): 아이디어 제안처럼 올릴 화면이 없는 글도 등록돼야 한다.
  it('★ 이미지가 0장이어도 통과 — 첨부는 선택', () => {
    expect(validateImages([])).toEqual({ ok: true });
  });

  it('3장 초과 거부', () => {
    const r = validateImages([file(png()), file(png()), file(png()), file(png())]);
    expect(r).toEqual({ ok: false, error: '이미지는 최대 3장까지 첨부할 수 있습니다.' });
  });

  it('5MB 초과 거부', () => {
    const r = validateImages([file(png(), MAX_IMAGE_BYTES + 1)]);
    expect(r).toEqual({ ok: false, error: '이미지 한 장의 크기는 5MB를 넘을 수 없습니다.' });
  });

  it('허용하지 않는 타입 거부', () => {
    const r = validateImages([file(gif())]);
    expect(r).toEqual({ ok: false, error: 'jpg, png, webp 이미지만 첨부할 수 있습니다.' });
  });
});
