'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function AuthButton({ user }: { user: User | null }) {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = getSupabaseBrowser();

  const signInWithGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Redirect happens — no need to setLoading(false).
  };

  const signInWithEmail = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (!error) setSent(true);
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    window.location.reload();
  };

  // ── Signed-in state ──────────────────────────────────────────────────────────
  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="max-w-45 truncate text-xs text-zinc-400">
          {user.email}
        </span>
        <button
          onClick={signOut}
          disabled={loading}
          suppressHydrationWarning
          className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  // ── Magic-link sent state ────────────────────────────────────────────────────
  if (sent) {
    return (
      <p className="text-xs text-green-400">
        ✓ Check your email for the sign-in link.
      </p>
    );
  }

  // ── Sign-in state ────────────────────────────────────────────────────────────
  if (emailMode) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && signInWithEmail()}
          placeholder="you@example.com"
          suppressHydrationWarning
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <button
          onClick={signInWithEmail}
          disabled={loading || !email.trim()}
          suppressHydrationWarning
          className="rounded bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
        >
          {loading ? '…' : 'Send link'}
        </button>
        <button
          onClick={() => setEmailMode(false)}
          suppressHydrationWarning
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={signInWithGoogle}
        disabled={loading}
        suppressHydrationWarning
        className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
      >
        <GoogleIcon />
        {loading ? 'Redirecting…' : 'Sign in with Google'}
      </button>
      <button
        onClick={() => setEmailMode(true)}
        suppressHydrationWarning
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Email
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}