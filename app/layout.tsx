import type { Metadata } from 'next';
import './globals.css';
import { getAuthUser } from '@/lib/supabase-server';
import AuthButton from '@/components/AuthButton';

export const metadata: Metadata = {
  title: 'AI Coding Tutor',
  description: 'Competitive programming tutor — progressive hints, never full solutions.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <html lang="en" className="dark h-full">
      <head>
        {/* KaTeX CSS is imported by the component; this prevents FOUC on first load. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex h-full flex-col bg-zinc-950 text-zinc-100 antialiased">
        {/* ── Global header ── */}
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <a href="/" className="text-sm font-semibold tracking-tight text-zinc-200">
            AI Coding Tutor
          </a>
          <AuthButton user={user} />
        </header>

        {/* ── Main content ── */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>

        {/* ── Footer ── */}
        <footer className="shrink-0 border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
          Problems sourced from{' '}
          <a
            href="https://huggingface.co/datasets/open-r1/codeforces"
            className="underline hover:text-zinc-400"
            target="_blank"
            rel="noopener noreferrer"
          >
            open-r1/codeforces
          </a>{' '}
          (ODC-By 4.0). AI feedback powered by Google Gemini.
        </footer>
      </body>
    </html>
  );
}