import Link from 'next/link';

// Target of the auth-callback failure redirect (previously a bare 404).
export default function AuthErrorPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-zinc-100">Sign-in failed</h1>
      <p className="max-w-sm text-sm text-zinc-500">
        We couldn’t complete the sign-in. The link may have expired or already
        been used. Please try again.
      </p>
      <div className="flex gap-3">
        <Link
          href="/auth"
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          Try again
        </Link>
        <Link
          href="/"
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          Back to problems
        </Link>
      </div>
    </div>
  );
}
