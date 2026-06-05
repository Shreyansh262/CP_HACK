'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Hint } from '@/lib/types';

export default function HintPanel({ hints }: { hints: Hint[] }) {
  const [revealed, setRevealed] = useState<number>(0);

  if (!hints || hints.length === 0) {
    return (
      <div className="text-sm text-zinc-500">No hints stored for this problem.</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Hints
      </div>

      {hints.map((h) => {
        const unlocked = h.level <= revealed;
        const nextUp = h.level === revealed + 1;

        return (
          <div
            key={h.level}
            className={`rounded-lg border p-3 ${
              unlocked
                ? 'border-zinc-700 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950/40'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-400">
                Hint {h.level}
                <span className="ml-2 text-[13px] uppercase tracking-wide text-zinc-600">
                  {h.level === 1 ? 'nudge' : h.level === 2 ? 'approach' : 'key insight'}
                </span>
              </div>
              {!unlocked && nextUp && (
                <button
                  onClick={() => setRevealed(h.level)}
                  className="rounded bg-zinc-100 px-2 py-1 text-[14px] font-medium text-zinc-900 hover:bg-white"
                >
                  Reveal
                </button>
              )}
            </div>

            {unlocked ? (
              <div className="prose prose-invert prose-base max-w-none text-zinc-200 [&_p]:my-1 [&_p]:leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {h.text}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="select-none text-sm leading-relaxed text-zinc-700 blur-xs">
                {h.text.slice(0, 120)}…
              </p>
            )}
          </div>
        );
      })}

      {revealed > 0 && (
        <button
          onClick={() => setRevealed(0)}
          className="mt-2 text-[14px] text-zinc-500 hover:text-zinc-300"
        >
          Reset hints
        </button>
      )}

      <div className="pt-4 text-[14px] leading-relaxed text-zinc-600">
        Hints are progressive: try the next one only if you're truly stuck. The
        tutor will never reveal the full solution.
      </div>
    </div>
  );
}