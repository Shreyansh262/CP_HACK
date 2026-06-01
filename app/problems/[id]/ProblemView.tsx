'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { User } from '@supabase/supabase-js';
import type { Problem } from '@/lib/types';
import ProblemStatement from '@/components/ProblemStatement';
import TutorChat from '@/components/TutorChat';

// Monaco is client-only and heavy — dynamic import, SSR off.
type CodeEditorProps = {
  language: 'cpp' | 'python';
  value: string;
  onChange: (v: string) => void;
};
const CodeEditor = dynamic<CodeEditorProps>(() => import('@/components/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      Loading editor…
    </div>
  ),
});

// ─── Starter templates ────────────────────────────────────────────────────────

const STARTER: Record<string, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // your code here

    return 0;
}
`,
  python: `import sys
input = sys.stdin.readline

def solve():
    pass

solve()
`,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Diagnostic = { line: number; message: string; severity: 'warn' | 'error' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProblemView({
  problem,
  user,
}: {
  problem: Problem;
  user: User | null;
}) {
  const [language, setLanguage] = useState<'cpp' | 'python'>('cpp');
  const [code, setCode] = useState<string>(STARTER.cpp);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [markedSolved, setMarkedSolved] = useState(false);

  // Web Worker for off-main-thread parsing.
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Phase 4: progress tracking ─────────────────────────────────────────────
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPingRef = useRef<string | null>(null);

  // Fire /open once on mount for signed-in users.
  useEffect(() => {
    if (!user) return;
    fetch('/api/progress/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: problem.id }),
    }).catch(() => {});
  }, [user, problem.id]);

  // Heartbeat: every 30s while tab is focused.
  useEffect(() => {
    if (!user) return;

    const ping = () => {
      fetch('/api/progress/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: problem.id, last_ping_at: lastPingRef.current }),
      })
        .then((r) => r.json())
        .then((d: { server_now?: string }) => {
          if (d.server_now) lastPingRef.current = d.server_now;
        })
        .catch(() => {});
    };

    const start = () => {
      if (heartbeatRef.current) return;
      ping(); // immediate first ping sets server_now baseline
      heartbeatRef.current = setInterval(ping, 30_000);
    };

    const stop = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    if (!document.hidden) start();
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, problem.id]);

  // ── Worker setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    workerRef.current = new Worker('/workers/parser.worker.js');
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Reset code on language switch.
  useEffect(() => {
    setCode(STARTER[language] ?? '');
  }, [language]);

  // Debounced parse: 350ms after last keystroke.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const myRun = ++runIdRef.current;

    timerRef.current = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;

      const handler = (e: MessageEvent) => {
        if (e.data.runId !== myRun) return;
        setDiagnostics(e.data.diagnostics ?? []);
        worker.removeEventListener('message', handler);
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ code, language, runId: myRun });
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, language]);

  // ── Mark solved handler ────────────────────────────────────────────────────
  const handleMarkSolved = () => {
    if (!user) return;
    fetch('/api/progress/mark-solved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: problem.id }),
    })
      .then(() => setMarkedSolved(true))
      .catch(() => {});
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Panel 1 — Problem statement */}
      <div className="w-100 shrink-0 overflow-y-auto border-r border-zinc-800">
        <ProblemStatement markdown={problem.problem_statement} />
      </div>

      {/* Panel 2 — Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'cpp' | 'python')}
            suppressHydrationWarning
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="cpp">C++17</option>
            <option value="python">Python 3</option>
          </select>

          {diagnostics.length > 0 && (
            <span className="text-xs text-amber-400">
              {diagnostics.length} issue{diagnostics.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Phase 4: Mark Solved button */}
          {user && (
            <button
              onClick={handleMarkSolved}
              disabled={markedSolved}
              suppressHydrationWarning
              className={`ml-auto rounded border px-2 py-0.5 text-[11px] transition-colors ${
                markedSolved
                  ? 'border-green-800 text-green-600 cursor-default'
                  : 'border-green-800 text-green-400 hover:border-green-600 hover:text-green-300'
              }`}
            >
              {markedSolved ? '✓ Solved' : '✓ Mark solved'}
            </button>
          )}
        </div>

        {/* Editor */}
        <div className="min-h-0 flex-1">
          <CodeEditor language={language} value={code} onChange={setCode} />
        </div>
      </div>

      {/* Panel 3 — Tutor chat */}
      <div className="w-90 shrink-0 border-l border-zinc-800">
        <TutorChat
          problem={problem}
          code={code}
          language={language}
          user={user}
        />
      </div>
    </div>
  );
}