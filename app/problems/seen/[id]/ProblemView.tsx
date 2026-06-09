'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { User } from '@supabase/supabase-js';
import type { Problem } from '@/lib/types';
import ProblemStatement from '@/components/ProblemStatement';
import TutorChat from '@/components/TutorChat';
import SimilarProblems from '@/components/SimilarProblems';
import Stopwatch from '@/components/Stopwatch';
import { useSessionCode } from '@/lib/useSessionCode';
import { downloadCode } from '@/lib/downloadCode';
// TODO: Phase 6 — wire back when execution provider is decided.
// import RunPanel from '@/components/RunPanel';

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
  // Editor state is session-cached per problem so it survives leaving the page
  // and coming back (cleared when the tab closes). See useSessionCode.
  const { language, code, setCode, switchLanguage } = useSessionCode(
    `ai-tutor:code:seen:${problem.id}`,
    STARTER,
  );
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [markedSolved, setMarkedSolved] = useState(false);

  // Web Worker for off-main-thread parsing.
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Phase 4: progress tracking ─────────────────────────────────────────────
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPingRef = useRef<string | null>(null);

  // Panel widths as percentages (middle takes whatever is left)
  const [leftPct, setLeftPct] = useState(30);
  const [rightPct, setRightPct] = useState(28);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartPct = useRef(0);
  const samples = (problem.sample_io ?? []) as { input: string; output: string }[];

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const containerW = containerRef.current.getBoundingClientRect().width;
      const dx = e.clientX - dragStartX.current;
      const deltaPct = (dx / containerW) * 100;

      if (dragging.current === 'left') {
        setLeftPct(Math.max(18, Math.min(45, dragStartPct.current + deltaPct)));
      } else {
        setRightPct(Math.max(18, Math.min(45, dragStartPct.current - deltaPct)));
      }
    }
    function onMouseUp() {
      dragging.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent, side: 'left' | 'right') {
    e.preventDefault();
    dragging.current = side;
    dragStartX.current = e.clientX;
    dragStartPct.current = side === 'left' ? leftPct : rightPct;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  // Fire /open once on mount for signed-in users.
  useEffect(() => {
    if (!user) return;
    fetch('/api/progress/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: problem.id }),
    }).catch(() => { });
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
        .catch(() => { });
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
    console.log('mark-solved payload:', { problemId: problem.id, source: 'seeded' });
    fetch('/api/progress/mark-solved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId: problem.id, source: 'seeded' }),
    })
      .then(() => setMarkedSolved(true))
      .catch(() => { });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      {/* Panel 1 — Problem statement */}
      <div
        className="shrink-0 overflow-y-auto border-zinc-800"
        style={{ width: `${leftPct}%` }}
      >
        <div className="p-4">
          <ProblemStatement markdown={problem.problem_statement} />
        </div>
        {samples.length > 0 && (
          <div className="border-t border-zinc-800 px-4 pt-3 pb-4">
            <p className="mb-2 text-xs font-medium text-zinc-400">Sample Cases</p>
            {samples.map((s, i) => (
              <div key={i} className="mb-3">
                <p className="mb-1 text-[13px] text-zinc-500">Case {i + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-0.5 text-[13px] text-zinc-600">Input</p>
                    <pre className="overflow-x-auto whitespace-pre rounded bg-zinc-800 p-2 text-xs leading-relaxed text-zinc-200">{s.input}</pre>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[13px] text-zinc-600">Output</p>
                    <pre className="overflow-x-auto whitespace-pre rounded bg-zinc-800 p-2 text-xs leading-relaxed text-zinc-200">{s.output}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-800 px-4 pt-3 pb-4">
          <p className="mb-2 text-xs font-medium text-zinc-400">Similar problems</p>
          <SimilarProblems problemId={problem.id} source="seeded" />
        </div>
      </div>
      <div
        className="group w-1 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-blue-500 active:bg-blue-400"
        onMouseDown={(e) => startDrag(e, 'left')}
      />
      {/* Panel 2 — Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
          <select
            value={language}
            onChange={(e) => switchLanguage(e.target.value as 'cpp' | 'python')}
            suppressHydrationWarning
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="cpp">C++17</option>
            <option value="python">Python 3</option>
          </select>

          {diagnostics.length > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {diagnostics.length} issue{diagnostics.length !== 1 ? 's' : ''}
            </span>
          )}

          <div className="ml-3">
            <Stopwatch />
          </div>

          {/* Save + Mark solved */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => downloadCode(code, language, problem.title)}
              suppressHydrationWarning
              title="Download your code to a file"
              className="rounded border border-zinc-700 px-2 py-0.5 text-[14px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              ↓ Save
            </button>

            {/* Phase 4: Mark Solved button */}
            {user && (
              <button
                onClick={handleMarkSolved}
                disabled={markedSolved}
                suppressHydrationWarning
                className={`rounded border px-2 py-0.5 text-[14px] transition-colors ${markedSolved
                  ? 'border-green-800 text-green-700 dark:text-green-600 cursor-default'
                  : 'border-green-800 text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 hover:border-green-600'
                  }`}
              >
                {markedSolved ? '✓ Solved' : '✓ Mark solved'}
              </button>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="min-h-0 flex-1">
          <CodeEditor language={language} value={code} onChange={setCode} />
        </div>
      </div>
      <div
        className="group w-1 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-blue-500 active:bg-blue-400"
        onMouseDown={(e) => startDrag(e, 'right')}
      />
      {/* Panel 3 — Tutor chat */}
      <div
        className="flex shrink-0 flex-col"
        style={{ width: `${rightPct}%` }}
      >
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