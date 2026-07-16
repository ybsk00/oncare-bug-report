'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 기본 <input type="file"> 은 두 번째 선택이 첫 선택을 통째로 갈아치운다 —
 * "한 장씩 골라 3장" 이 불가능하다는 신고(2026-07-16)의 원인. 게다가 모바일
 * 갤러리 상당수는 복수 선택 UI 를 아예 주지 않는다. 그래서 선택할 때마다
 * 누적하고, 썸네일에서 한 장씩 뺄 수 있게 한다.
 *
 * input 에 name 이 없다 — FormData(form) 자동 수집 대상이 아니며,
 * 부모가 submit 시 files 를 직접 fd.append('images', f) 해야 한다.
 */
export function ImagePicker({
  max,
  files,
  onChange,
}: {
  max: number;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (picked: FileList | null) => {
    if (!picked?.length) return;
    setNotice(null);
    const next = [...files];
    const skipped: string[] = [];
    for (const f of Array.from(picked)) {
      if (next.length >= max) {
        setNotice(`이미지는 최대 ${max}장까지 첨부할 수 있습니다.`);
        break;
      }
      if (f.size > MAX_BYTES) {
        skipped.push(f.name);
        continue;
      }
      const dup = next.some(
        (p) => p.name === f.name && p.size === f.size && p.lastModified === f.lastModified,
      );
      if (!dup) next.push(f);
    }
    if (skipped.length) setNotice(`5MB를 넘는 이미지는 첨부할 수 없습니다: ${skipped.join(', ')}`);
    onChange(next);
    // 같은 파일을 뺐다가 다시 고를 수 있도록 입력값을 비운다.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="mt-1 space-y-2">
      <input
        ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => add(e.target.files)}
      />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기 */}
              <img src={previews[i]} alt={f.name} className="h-20 w-20 rounded border object-cover" />
              <button
                type="button" aria-label={`${f.name} 삭제`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs leading-none text-white hover:bg-rose-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length < max && (
        <button
          type="button" onClick={() => inputRef.current?.click()}
          className="rounded border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + 사진 추가 ({files.length}/{max})
        </button>
      )}

      {notice && <p className="text-[11px] text-amber-700">{notice}</p>}
    </div>
  );
}
