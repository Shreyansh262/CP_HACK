import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import Script from 'next/script';
import { getAuthUser } from '@/lib/supabase-server';
import AuthButton from '@/components/AuthButton';
import Footer from '@/components/Footer';
import ThemeToggle from '@/components/ThemeToggle';

// Runs before paint to set the theme from a saved choice or the OS preference,
// avoiding a flash of the wrong theme. Kept tiny and dependency-free.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`;

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
    <html lang="en" data-theme="dark" className="h-full" suppressHydrationWarning>
      <body className="flex h-full flex-col bg-zinc-950 text-[18px] text-zinc-100 antialiased">
        {/* Apply the saved/system theme before hydration (no flash). Uses
            next/script beforeInteractive — a raw <script> rendered by a React
            component is not executed on the client and breaks hydration. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {/* ── Header: sticky, links home ── */}
        <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-5 py-3 backdrop-blur">
          <Link
            href="/"
            className="text-2xl font-extrabold text-zinc-100 hover:text-zinc-50"
          >
            CF BUDDY
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user && (
              <Link
                href="/profile"
                className="rounded-md border border-black/10 bg-black/5 px-3 py-1.5 text-base text-zinc-300 hover:border-black/20 hover:bg-black/10 hover:text-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
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