const STYLE: Record<string, string> = {
  접수: 'bg-slate-100 text-slate-700',
  확인중: 'bg-amber-100 text-amber-800',
  수정완료: 'bg-emerald-100 text-emerald-800',
  재현불가: 'bg-rose-100 text-rose-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STYLE[status] ?? STYLE['접수']}`}>
      {status}
    </span>
  );
}
