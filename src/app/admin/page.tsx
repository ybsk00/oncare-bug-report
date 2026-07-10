'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { ImageGrid } from '@/components/ImageGrid';

const STATUSES = ['접수', '확인중', '수정완료', '재현불가'] as const;

interface AdminRow {
  id: string;
  seq: number;
  department: string;
  reporterName: string;
  title: string;
  body: string;
  imageCount: number;
  status: string;
  adminNote: string | null;
  appVersion: string | null;
  platform: string | null;
  deviceModel: string | null;
  createdAt: number;
}

export default function AdminPage() {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/reports');
    if (!res.ok) { setRows(null); return false; }
    setRows((await res.json()).items);
    return true;
  }, []);

  // 이미 관리자 쿠키가 있으면 로그인 화면을 건너뛴다
  useEffect(() => { void load().finally(() => setChecked(true)); }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) { setError('비밀번호가 일치하지 않습니다.'); return; }
    await load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
  };

  if (!checked) return <p className="text-center text-slate-400">확인 중…</p>;

  if (!rows) {
    return (
      <form onSubmit={login} className="mx-auto max-w-sm space-y-3 rounded-lg border bg-white p-5">
        <p className="text-sm text-slate-600">관리자 비밀번호</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus
               className="w-full rounded border px-3 py-2 text-sm" />
        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <button className="w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white">로그인</button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">전체 {rows.length}건</p>

      {rows.map((r) => (
        <article key={r.id} className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">#{r.seq}</span>
            <b>{r.title}</b>
            <span className="text-sm text-slate-500">{r.department} · {r.reporterName}</span>
            <StatusBadge status={r.status} />
            <span className="ml-auto text-xs text-slate-400">
              {[r.platform, r.appVersion, r.deviceModel].filter(Boolean).join(' · ') || '기기 정보 없음'}
              {' · '}
              {new Date(r.createdAt).toLocaleDateString('ko-KR')}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm">{r.body}</p>

          <ImageGrid reportId={r.id} count={r.imageCount} />

          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => patch(r.id, { status: s })}
                className={`rounded border px-2 py-1 text-xs ${
                  r.status === s ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <textarea
            defaultValue={r.adminNote ?? ''} rows={2} placeholder="작성자에게 보일 답변 (포커스를 벗어나면 저장)"
            onBlur={(e) => patch(r.id, { adminNote: e.target.value || null })}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </article>
      ))}
    </div>
  );
}
