'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Problem } from '@/lib/types';
import ProblemStatement from '@/components/ProblemStatement';
import HintPanel from '@/components/HintPanel';

// Explicit generic preserves props type that dynamic() would otherwise lose.
type CodeEditorProps = {
  language: 'cpp' | 'python';
  value: string;
  onChange: (v: string) => void;
};
const CodeEditor = dynamic<CodeEditorProps>(
  () => import('@/components/CodeEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Loading editor…
      </div>
    ),
  }
);

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

type Diagnostic = { line: number; message: string; severity: 'warn' | 'error' };

export default function ProblemView({ problem }: { problem: Problem }) {
  const [language, setLanguage] = useState<'cpp' | 'python'>('cpp');
  const [code, setCode] = useState<string>(STARTER.cpp);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    workerRef.current = new Worker('/workers/parser.worker.js');
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setCode(STARTER[language] ?? '');
  }, [language]);

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
      worker.postMessage({ runId: myRun, language, code });
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, language]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 gap-0">
      {/* Left: problem statement */}
      <section className="col-span-4 min-h-0 overflow-y-auto border-r border-zinc-800 p-5">
        <ProblemStatement markdown={problem.problem_statement} />
      </section>

      {/* Middle: editor */}
      <section className="col-span-5 flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'cpp' | 'python')}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
          >
            <option value="cpp">C++</option>
            <option value="python">Python</option>
          </select>
          <div className="text-xs text-zinc-500">
            {diagnostics.length === 0
              ? '✓ no issues'
              : `${diagnostics.length} issue${diagnostics.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor language={language} value={code} onChange={setCode} />
        </div>
        {diagnostics.length > 0 && (
          <div className="max-h-32 shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px]">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className={
                  d.severity === 'error' ? 'text-red-400' : 'text-amber-400'
                }
              >
                line {d.line}: {d.message}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Right: hints */}
      <section className="col-span-3 min-h-0 overflow-y-auto border-l border-zinc-800 p-4">
        <HintPanel hints={problem.hints} />
      </section>
    </div>
  );
}