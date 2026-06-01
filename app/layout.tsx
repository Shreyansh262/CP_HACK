import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthButton from '@/components/AuthButton';
import { getAuthUser } from '@/lib/supabase-server';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Coding Tutor',
  description: 'Competitive programming practice with adaptive AI hints',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} flex min-h-screen flex-col bg-zinc-950 text-zinc-100`}>
        {/* ── Header ── */}
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-2">
          <Link href="/" className="text-sm font-semibold text-zinc-100 hover:text-white">
            AI Coding Tutor
          </Link>

          <span className="text-xs text-zinc-600">·</span>

          {/* Phase 4: Profile link for signed-in users */}
          {user && (
            <Link
              href="/profile"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Profile
            </Link>
          )}

          <div className="ml-auto">
            <AuthButton user={user} />
          </div>
        </header>

        {/* ── Main ── */}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>

        {/* ── Footer ── */}
        <footer className="shrink-0 border-t border-zinc-800 px-4 py-2 text-center text-[10px] text-zinc-600">
          Problems sourced from{' '}
          <a
            href="https://huggingface.co/datasets/open-r1/codeforces"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-400"
          >
            open-r1/codeforces
          </a>{' '}
          (ODC-By 4.0). AI feedback powered by Google Gemini.
        </footer>
      </body>
    </html>
  );
}