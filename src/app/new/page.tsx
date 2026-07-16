'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImagePicker } from '@/components/ImagePicker';

export default function NewPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<File[]>([]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    images.forEach((f) => fd.append('images', f));
    try {
      const res = await fetch('/api/reports', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      alert('접수되었습니다.\n\n비밀번호는 복구할 수 없으니 꼭 기억해 주세요.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-white p-5">
      {/* honeypot — 사람에겐 보이지 않는다. 채워지면 봇으로 본다. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-slate-500">부서명</span>
          <input name="department" required maxLength={50} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">이름</span>
          <input name="reporterName" required maxLength={30} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">제목</span>
        <input name="title" required maxLength={200} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        <span className="mt-1 block text-[11px] text-rose-600">
          제목은 목록에서 모두에게 보입니다. 환자 이름·차트번호를 쓰지 마세요.
        </span>
      </label>

      <label className="block">
        <span className="text-xs text-slate-500">내용</span>
        <textarea
          name="body" required maxLength={5000} rows={6}
          placeholder="어떤 화면에서, 무엇을 눌렀을 때, 어떻게 되었는지 적어 주세요."
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs text-slate-500">비밀번호 (4자 이상)</span>
        <input name="password" type="password" required minLength={4} maxLength={72}
               className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        <span className="mt-1 block text-[11px] text-amber-700">
          이 게시글 전용 비밀번호입니다. 평소 쓰는 비밀번호를 넣지 마세요. 복구할 수 없습니다.
        </span>
      </label>

      {/* 첨부는 선택 — 아이디어 제안처럼 올릴 화면이 없는 글도 있다(2026-07-13 외래팀 제보). */}
      <div className="block">
        <span className="text-xs text-slate-500">첨부 이미지 (선택 · 최대 3장 · jpg/png/webp · 5MB 이하)</span>
        <ImagePicker max={3} files={images} onChange={setImages} />
        <span className="mt-1 block text-[11px] text-slate-400">
          버그는 화면 캡처가 있으면 훨씬 빨리 고칠 수 있어요. 한 장씩 골라도 계속 추가됩니다.
          아이디어 제안이라면 첨부 없이 등록해도 됩니다.
        </span>
      </div>

      {/* 앱 버전·기기는 묻지 않는다 (2026-07-10 대표님). 서버 스키마는 여전히 optional 이라
          값이 안 오면 null 로 저장되고, 관리자 화면은 '기기 정보 없음' 으로 표시한다. */}
      <label className="block sm:max-w-xs">
        <span className="text-xs text-slate-500">OS (선택)</span>
        <select name="platform" defaultValue="" className="mt-1 w-full rounded border px-3 py-2 text-sm">
          <option value="">선택</option>
          <option value="iOS">iOS</option>
          <option value="Android">Android</option>
        </select>
      </label>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <button type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? '등록 중…' : '등록'}
      </button>
    </form>
  );
}
