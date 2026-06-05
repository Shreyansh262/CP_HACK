'use client';
//Reduntant component, not used anywhere, but keeping for now in case we want to add a "Run on samples" button in the future that opens this as a panel instead of inline results
import { useState } from 'react';

interface SampleCase {
  input: string;
  output: string;
}

interface CaseResult {
  index: number;
  passed: boolean;
  status: string;
  stdout: string | null;
  stderr: string | null;
  expected: string;
  time_ms: number | null;
  memory_kb: number | null;
}

interface Props {
  code: string;
  language: 'cpp' | 'python';
  samples: SampleCase[];
  /** Called when all sample cases pass — triggers mark-solved flow */
  onAllPassed?: () => void;
}

export default function RunPanel({ code, language, samples, onAllPassed }: Props) {
  const [results, setResults]   = useState<CaseResult[]>([]);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [allPassed, setAllPassed] = useState(false);

  if (!samples || samples.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-zinc-500">
        No sample test cases available for this problem.
      </div>
    );
  }

  async function runCode() {
    if (!code.trim()) {
      setError('Write some code first.');
      return;
    }

    setRunning(true);
    setError(null);
    setResults([]);
    setAllPassed(false);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, samples }),
      });

      const data = await res.json() as {
        results?: CaseResult[];
        allPassed?: boolean;
        error?: string;
      };

      if (!res.ok || data.error) {
        setError(data.error ?? 'Execution failed.');
        return;
      }

      setResults(data.results ?? []);
      if (data.allPassed) {
        setAllPassed(true);
        onAllPassed?.();
      }
    } catch {
      setError('Network error — could not reach the execution service.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {/* Run button */}
      <button
        onClick={runCode}
        disabled={running}
        className="flex items-center justify-center gap-2 rounded border border-zinc-700
                   px-3 py-1.5 text-sm font-medium text-zinc-300
                   hover:border-zinc-500 hover:text-zinc-100
                   disabled:cursor-not-allowed disabled:opacity-50
                   transition-colors"
      >
        {running ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Running…
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Run on samples
          </>
        )}
      </button>

      {/* All-pass celebration */}
      {allPassed && (
        <div className="rounded border border-green-800 bg-green-900/20 px-3 py-2 text-sm text-green-400">
          🎉 All sample cases passed! Problem marked as solved.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <div
              key={r.index}
              className={`rounded border px-3 py-2 text-xs ${
                r.passed
                  ? 'border-green-900 bg-green-950/20'
                  : 'border-red-900 bg-red-950/20'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className={`font-medium ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {r.passed ? '✓' : '✗'} Case {r.index}
                  <span className="ml-2 font-normal text-zinc-500">{r.status}</span>
                </span>
                <span className="text-zinc-600">
                  {r.time_ms != null && `${r.time_ms}ms`}
                  {r.memory_kb != null && ` · ${(r.memory_kb / 1024).toFixed(1)}MB`}
                </span>
              </div>

              {/* Show diff on failure */}
              {!r.passed && (
                <div className="mt-2 flex flex-col gap-1">
                  {r.stdout != null && (
                    <div>
                      <span className="text-zinc-500">Your output: </span>
                      <span className="font-mono text-red-300 break-all">{r.stdout || '(empty)'}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500">Expected: </span>
                    <span className="font-mono text-zinc-300 break-all">{r.expected || '(empty)'}</span>
                  </div>
                  {r.stderr && (
                    <div>
                      <span className="text-zinc-500">Error: </span>
                      <span className="font-mono text-yellow-400 break-all">{r.stderr.slice(0, 300)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      <p className="text-[10px] text-zinc-600">
        Runs against sample cases only · Execution sandboxed via Judge0
      </p>
    </div>
  );
}