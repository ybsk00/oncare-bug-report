import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '온코케어 AI — 앱 버그 신고',
  description: '온코케어 AI 앱 사용 중 발견한 버그를 신고합니다.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
            <Link href="/" className="text-lg font-bold text-brand-700">
              온코케어 AI
            </Link>
            <span className="hidden text-sm text-slate-400 sm:inline">근거로 돌보는 케어</span>
            <span className="ml-auto rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
              앱 버그 신고
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
