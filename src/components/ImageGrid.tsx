'use client';

/**
 * 이미지는 /api/image 프록시로만 받는다. Convex URL 은 브라우저에 노출되지 않는다.
 * `?download=1` 로 웹에서 바로 내려받을 수 있다 (대표님 요청).
 */
export function ImageGrid({ reportId, count }: { reportId: string; count: number }) {
  if (count === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <figure key={i} className="overflow-hidden rounded border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/image/${reportId}/${i}`} alt={`첨부 이미지 ${i + 1}`} className="w-full" />
          <figcaption className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-500">
            <span>{i + 1}번</span>
            <a
              href={`/api/image/${reportId}/${i}?download=1`}
              download
              className="font-semibold text-brand-700 hover:underline"
            >
              다운로드
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
