import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/supabase-server';
import AuthButton from '@/components/AuthButton';

export const dynamic = 'force-dynamic';

// Standalone sign-in page. The header already hosts an AuthButton, but the
// homepage anonymous CTA links here, so the route must exist (it previously
// 404'd). Signed-in users are bounced home.
export default async function AuthPage() {
  const user = await getAuthUser();
  if (user) redirect('/');

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-xl font-bold text-zinc-100">Sign in to CF BUDDY</h1>
        <p className="text-sm text-zinc-500">
          Unlock AI-powered hints and track your progress. Browsing problems and
          stored hints stays free without an account.
        </p>
        <AuthButton user={null} />
        <Link
          href="/"
          className="text-xs text-zinc-500 underline hover:text-zinc-300"
        >
          ← Back to problems
        </Link>
      </div>
    </div>
  );
}
