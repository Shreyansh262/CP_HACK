'use client';

import { useEffect, useRef, useState } from 'react';

// Client-side visual aid for the current sitting only. Does NOT persist and
// does NOT write to the DB — heartbeat time-tracking remains the source of
// truth for time_spent_seconds. Resets to 00:00:00 on reload.

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0); // Date.now() when the current run began
  const accRef = useRef(0);   // accumulated ms from previous runs

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedMs(accRef.current + (Date.now() - startRef.current));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const start = () => setRunning(true);
  const pause = () => {
    accRef.current += Date.now() - startRef.current;
    setElapsedMs(accRef.current);
    setRunning(false);
  };
  const reset = () => {
    accRef.current = 0;
    setElapsedMs(0);
    setRunning(false);
  };

  const btn =
    'rounded border border-zinc-700 px-2.5 py-1 text-[14px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100';

  return (
    <div className="flex items-center gap-1.5" title="Manual stopwatch (this sitting only — not saved)">
      <span className="font-mono tabular-nums text-[14px] text-zinc-400">{fmt(elapsedMs)}</span>
      {running ? (
        <button onClick={pause} suppressHydrationWarning className={btn}>
          Pause
        </button>
      ) : (
        <button onClick={start} suppressHydrationWarning className={btn}>
          {elapsedMs > 0 ? 'Resume' : 'Start'}
        </button>
      )}
      {!running && elapsedMs > 0 && (
        <button onClick={reset} suppressHydrationWarning className={btn}>
          Reset
        </button>
      )}
    </div>
  );
}
