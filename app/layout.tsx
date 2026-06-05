import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { getAuthUser } from '@/lib/supabase-server';
import AuthButton from '@/components/AuthButton';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'CF BUDDY',
  description: 'Competitive programming tutor powered by AI',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  return (
    <html lang="en" className="dark h-full">
      <body className="flex h-full flex-col bg-zinc-950 text-[17px] text-zinc-100 antialiased">
        {/* ── Header: sticky, links home ── */}
        <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-5 py-3 backdrop-blur">
          <Link
            href="/"
            className="text-2xl font-extrabold text-zinc-100 hover:text-white"
          >
            CF BUDDY
          </Link>
          <div className="flex items-center gap-4">
            {user && (
              <Link
                href="/profile"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-base text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
              >
                Profile
              </Link>
            )}
            <AuthButton user={user} />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>

        <Footer />
      </body>
    </html>
  );
}