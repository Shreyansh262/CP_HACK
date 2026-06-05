'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-900 text-center text-xs text-zinc-600">
      <div className="mx-auto max-w-6xl px-5 py-3">
        Problems sourced from{' '}
        <Link
          href="https://github.com/open-r1/codeforces"
          className="text-zinc-500 hover:text-zinc-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          open-r1/codeforces
        </Link>{' '}
        (ODC-By 4.0). AI feedback powered by Google Gemini.
      </div>
    </footer>
  );
}
