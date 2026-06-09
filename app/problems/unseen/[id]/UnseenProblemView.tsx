'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { User } from '@supabase/supabase-js';
import type { Problem } from '@/lib/types';
import ProblemStatement from '@/components/ProblemStatement';
import TutorChat from '@/components/TutorChat';
import Stopwatch from '@/components/Stopwatch';
import { useSessionCode } from '@/lib/useSessionCode';
import { downloadCode } from '@/lib/downloadCode';
// TODO: Phase 6 — wire back when execution provider is decided.
// import RunPanel from '@/components/RunPanel';
import SimilarProblems from '@/components/SimilarProblems';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SampleIO {
  input: string;
  output: string;
}

interface UnseenProblem {
  id: string;
  title: string;
  problem_statement: string;
  constraints_text: string | null;
  sample_io: SampleIO[] | null;
  difficulty: string | null;
  tags: string[] | null;
  hints: { level: number; text: string }[] | null;
}

interface Props {
  problem: UnseenProblem;
  user: User | null;
}

// Adapter: shape UnseenProblem into the Problem type TutorChat expects
function toTutorProblem(p: UnseenProblem): Problem {
  return {
    id: p.id,
    source: 'unseen',
    external_id: null,
    title: p.title,
    problem_statement: p.problem_statement,
    difficulty: p.difficulty,
    tags: p.tags ?? [],
    hints: (p.hints ?? []).map(h => ({ level: h.level as 1 | 2 | 3, text: h.text })),
    edge_cases: [] as string[],
    created_at: new Date().toISOString(),   // ← add this line
  };
}
// ─── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_CPP = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    // your code here
    
    return 0;
}`;

const DEFAULT_PYTHON = `import sys
input = sys.stdin.readline

def main():
    # your code here
    pass

main()`;

const STARTER: Record<'cpp' | 'python', string> = {
  cpp: DEFAULT_CPP,
  python: DEFAULT_PYTHON,
};

export default function UnseenProblemView({ problem, user }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(30);
  const [rightPct, setRightPct] = useState(28);
  // Editor state is session-cached per problem so it survives leaving the page
  // and coming back (cleared when the tab closes). See useSessionCode.
  const { language, code, setCode, switchLanguage } = useSessionCode(
    `ai-tutor:code:unseen:${problem.id}`,
    STARTER,
  );
  const [solved, setSolved] = useState(false);
  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startPct: number } | null>(null);

  // ── Mark solved ─────────────────────────────────────────────────────────────
  const markSolved = useCallback(async () => {
    if (solved || !user) return;
    setSolved(true);
    fetch('/api/progress/mark-solved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId: problem.id, source: 'unseen' }),
    }).catch(() => { });
  }, [solved, user, problem.id]);

  // ── Drag resize ─────────────────────────────────────────────────────────────
  function startDrag(e: React.MouseEvent, side: 'left' | 'right') {
    e.preventDefault();
    dragRef.current = { side, startX: e.clientX, startPct: side === 'left' ? leftPct : rightPct };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const totalW = containerRef.current.offsetWidth;
      const dx = e.clientX - dragRef.current.startX;
      const delta = (dx / totalW) * 100;
      const min = 15, max = 50;
      if (dragRef.current.side === 'left') {
        setLeftPct(Math.max(min, Math.min(max, dragRef.current.startPct + delta)));
      } else {
        setRightPct(Math.max(min, Math.min(max, dragRef.current.startPct - delta)));
      }
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const samples = problem.sample_io ?? [];

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-48px)] overflow-hidden">

      {/* ── Left: Problem statement ── */}
      <div className="flex shrink-0 flex-col overflow-hidden" style={{ width: `${leftPct}%` }}>
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
          <div>
            <span className="text-xs font-medium text-zinc-300">{problem.title}</span>
            {problem.difficulty && (
              <span className="ml-2 text-xs text-zinc-500">{problem.difficulty}</span>
            )}
          </div>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] text-zinc-400">Unseen</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <ProblemStatement markdown={problem.problem_statement} />
          </div>

          {/* Samples */}
          {samples.length > 0 && (
            <div className="px-4 pb-4">
              <p className="mb-2 text-xs font-medium text-zinc-400">Sample Cases</p>
              {samples.map((s, i) => (
                <div key={i} className="mb-3">
                  <p className="mb-1 text-[13px] text-zinc-500">Case {i + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-0.5 text-[13px] text-zinc-600">Input</p>
                      <pre className="overflow-x-auto whitespace-pre rounded bg-zinc-800 p-2 text-xs text-zinc-200">{s.input}</pre>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[13px] text-zinc-600">Output</p>
                      <pre className="overflow-x-auto whitespace-pre rounded bg-zinc-800 p-2 text-xs text-zinc-200">{s.output}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Similar problems. The Run-on-samples tab is deferred. */}
          {/* TODO: Phase 6 — wire back when execution provider is decided. */}
          <div className="border-t border-zinc-800 px-4 pt-3 pb-4">
            <p className="mb-2 text-xs font-medium text-zinc-400">Similar problems</p>
            <SimilarProblems problemId={problem.id} source="unseen" />
          </div>
        </div>
      </div>

      {/* ── Drag handle: left ── */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-blue-500 active:bg-blue-400 transition-colors"
        onMouseDown={(e) => startDrag(e, 'left')}
      />

      {/* ── Middle: Editor ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-700 text-sm">
            <button
              onClick={() => switchLanguage('cpp')}
              className={`px-3 py-1 ${language === 'cpp' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              C++17
            </button>
            <button
              onClick={() => switchLanguage('python')}
              className={`border-l border-zinc-700 px-3 py-1 ${language === 'python' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              Python 3
            </button>
          </div>

          <div className="ml-3">
            <Stopwatch />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => downloadCode(code, language, problem.title)}
              suppressHydrationWarning
              title="Download your code to a file"
              className="rounded border border-zinc-700 px-3 py-1 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
            >
              ↓ Save
            </button>

            {user && (
              <button
                onClick={markSolved}
                disabled={solved}
                suppressHydrationWarning
                className={`rounded border px-3 py-1 text-sm font-medium transition-colors ${solved
                    ? 'cursor-default border-green-800 bg-green-900/30 text-green-500'
                    : 'border-zinc-700 text-zinc-400 hover:border-green-700 hover:text-green-400'
                  }`}
              >
                {solved ? '✓ Solved' : 'Mark solved'}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <CodeEditor value={code} language={language} onChange={(v) => setCode(v ?? '')} />
        </div>
      </div>

      {/* ── Drag handle: right ── */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-blue-500 active:bg-blue-400 transition-colors"
        onMouseDown={(e) => startDrag(e, 'right')}
      />

      {/* ── Right: Tutor chat ── */}
      <div className="flex shrink-0 flex-col" style={{ width: `${rightPct}%` }}>
        <TutorChat
          problem={toTutorProblem(problem)}
          code={code}
          language={language}
          user={user}
        />
      </div>
    </div>
  );
}