'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { ImageGrid } from '@/components/ImageGrid';
import { ImagePicker } from '@/components/ImagePicker';

interface Unlocked {
  canDelete: boolean;
  title: string;
  department: string;
  reporterName: string;
  body: string;
  imageCount: number;
  status: string;
  adminNote: string | null;
  appVersion: string | null;
  platform: string | null;
  deviceModel: string | null;
}

export default function ReportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Unlocked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // 수정 폼 상태 — keep 은 남길 기존 이미지 인덱스, newImages 는 새로 추가할 파일.
  const [keep, setKeep] = useState<number[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  const startEditing = () => {
    setKeep(Array.from({ length: data?.imageCount ?? 0 }, (_, i) => i));
    setNewImages([]);
    setError(null);
    setEditing(true);
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${params.id}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '열람에 실패했습니다.');
      setData(d as Unlocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : '열람에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 새 이미지를 고른 뒤 유지 체크를 되살리면 합계가 3장을 넘을 수 있다 — 서버 400 전에 여기서 막는다.
    if (keep.length + newImages.length > 3) {
      setError('이미지는 유지하는 것과 합쳐 최대 3장까지입니다. 새 이미지를 줄이거나 유지 체크를 해제해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    // 체크가 해제된 기존 이미지는 삭제된다. 남길 인덱스만 서버로 보낸다.
    fd.set('keepIndexes', JSON.stringify(keep));
    newImages.forEach((f) => fd.append('images', f));

    try {
      const res = await fetch(`/api/reports/${params.id}`, { method: 'PATCH', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? '수정에 실패했습니다.');
      }
      // 저장 결과를 서버에서 다시 읽어온다(이미지 개수까지 정확히 반영).
      const re = await fetch(`/api/reports/${params.id}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (re.ok) setData((await re.json()) as Unlocked);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('이 글을 삭제할까요? 첨부 이미지까지 함께 지워지며 되돌릴 수 없습니다.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${params.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? '삭제에 실패했습니다.');
      }
      alert('삭제되었습니다.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <form onSubmit={unlock} className="mx-auto max-w-sm space-y-3 rounded-lg border bg-white p-5">
        <p className="text-sm text-slate-600">작성 시 입력한 비밀번호를 넣어 주세요.</p>
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus
          className="w-full rounded border px-3 py-2 text-sm"
        />
        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <button disabled={busy}
                className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? '확인 중…' : '열람'}
        </button>
        <p className="text-[11px] text-slate-400">
          열람 후 수정할 수 있습니다. 삭제는 개발팀만 가능하니 필요하면 요청해 주세요.
        </p>
      </form>
    );
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-4 rounded-lg border bg-white p-5">
        <h1 className="text-base font-bold">글 수정</h1>

        <label className="block">
          <span className="text-xs text-slate-500">제목</span>
          <input name="title" defaultValue={data.title} required maxLength={200}
                 className="mt-1 w-full rounded border px-3 py-2 text-sm" />
          <span className="mt-1 block text-[11px] text-rose-600">
            제목은 목록에서 모두에게 보입니다. 환자 이름·차트번호를 쓰지 마세요.
          </span>
        </label>

        <label className="block">
          <span className="text-xs text-slate-500">내용</span>
          <textarea name="body" defaultValue={data.body} required maxLength={5000} rows={6}
                    className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>

        <label className="block sm:max-w-xs">
          <span className="text-xs text-slate-500">OS (선택)</span>
          <select name="platform" defaultValue={data.platform ?? ''}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="">선택</option>
            <option value="iOS">iOS</option>
            <option value="Android">Android</option>
          </select>
        </label>

        {data.imageCount > 0 && (
          <fieldset className="rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs text-slate-500">첨부 이미지 — 체크를 해제하면 삭제됩니다</legend>
            <div className="space-y-2">
              {Array.from({ length: data.imageCount }, (_, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" checked={keep.includes(i)}
                    onChange={(e) =>
                      setKeep((prev) =>
                        e.target.checked ? [...prev, i].sort((a, b) => a - b) : prev.filter((k) => k !== i),
                      )
                    }
                  />
                  <span>{i + 1}번 이미지 유지</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="block">
          <span className="text-xs text-slate-500">
            이미지 추가 (선택 · 유지하는 이미지와 합쳐 총 3장까지)
          </span>
          <ImagePicker max={Math.max(0, 3 - keep.length)} files={newImages} onChange={setNewImages} />
        </div>

        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={busy}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={busy}
                  className="rounded-lg border px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            취소
          </button>
        </div>
      </form>
    );
  }

  const meta = [data.platform, data.appVersion, data.deviceModel].filter(Boolean).join(' · ');

  return (
    <article className="space-y-4 rounded-lg border bg-white p-5">
      <header className="space-y-1">
        <h1 className="text-lg font-bold">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>{data.department} · {data.reporterName}</span>
          <StatusBadge status={data.status} />
          <span className="text-xs text-slate-400">{meta || '기기 정보 없음'}</span>
        </div>
      </header>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.body}</p>

      <ImageGrid reportId={params.id} count={data.imageCount} />

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="flex gap-2 border-t pt-3">
        <button onClick={startEditing} disabled={busy}
                className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
          수정하기
        </button>
        {data.canDelete && (
          <button onClick={remove} disabled={busy}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            삭제하기
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        열람·수정 권한은 10분간 유지됩니다. 이후에는 비밀번호를 다시 입력해야 합니다.
        삭제는 개발팀만 할 수 있습니다.
      </p>

      {data.adminNote && (
        <div className="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <b className="text-brand-700">관리자 답변</b>
          <p className="mt-1 whitespace-pre-wrap">{data.adminNote}</p>
        </div>
      )}
    </article>
  );
}
