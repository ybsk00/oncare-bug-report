export type ImageKind = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 3;

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/**
 * 파일 확장자와 Content-Type 은 클라이언트가 마음대로 보낸다.
 * 실제 바이트(매직넘버)로만 판별한다.
 */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/**
 * 첨부는 **선택**이다 — 아이디어 제안처럼 올릴 화면이 없는 글도 있다(2026-07-13 외래팀 제보).
 * 0장도 통과시키고, 개수·크기·실제 바이트 형식만 본다.
 */
export function validateImages(
  files: { bytes: Uint8Array; size: number }[],
): { ok: true } | { ok: false; error: string } {
  if (files.length > MAX_IMAGES) return { ok: false, error: '이미지는 최대 3장까지 첨부할 수 있습니다.' };
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) return { ok: false, error: '이미지 한 장의 크기는 5MB를 넘을 수 없습니다.' };
    if (!sniffImageType(f.bytes)) return { ok: false, error: 'jpg, png, webp 이미지만 첨부할 수 있습니다.' };
  }
  return { ok: true };
}
