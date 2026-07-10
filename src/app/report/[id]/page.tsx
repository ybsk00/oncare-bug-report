'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { ImageGrid } from '@/components/ImageGrid';

interface Unlocked {
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
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Unlocked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <p className="text-[11px] text-slate-400">관리자는 비밀번호 없이 열람할 수 있습니다.</p>
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

      <p className="text-[11px] text-slate-400">
        열람 권한은 10분간 유지됩니다. 이후에는 비밀번호를 다시 입력해야 합니다.
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
