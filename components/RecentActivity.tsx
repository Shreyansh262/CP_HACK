'use client';

import type { ProgressRow } from '@/lib/profile-queries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'solved')
    return (
      <span className="shrink-0 rounded bg-green-950 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
        Solved
      </span>
    );
  if (status === 'given_up')
    return (
      <span className="shrink-0 rounded bg-red-950 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
        Given up
      </span>
    );
  return (
    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
      Attempted
    </span>
  );
}

function fmtTime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecentActivity({ rows }: { rows: ProgressRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No activity yet. Open a problem to start!
      </p>
    );
  }

  return (
    <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
      {rows.map((row) => (
        <a
          key={row.id}
          href={`/problems/${row.problem_id}`}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900"
        >
          {/* Problem name */}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm text-zinc-200">
              {row.competitive_problems?.external_id
                ? `${row.competitive_problems.external_id} · `
                : ''}
              {row.competitive_problems?.title ?? 'Unknown problem'}
            </span>
            <div className="mt-0.5 flex flex-wrap gap-3 text-[10px] text-zinc-500">
              <span>⏱ {fmtTime(row.time_spent_seconds)}</span>
              {row.hints_used > 0 && <span>💡 {row.hints_used} hint{row.hints_used !== 1 ? 's' : ''}</span>}
              {(row.tier1_calls > 0 || row.tier2_calls > 0) && (
                <span>
                  AI ⚡{row.tier1_calls} 🔬{row.tier2_calls}
                </span>
              )}
              <span>{fmtDate(row.updated_at)}</span>
            </div>
          </div>

          <StatusBadge status={row.status} />
        </a>
      ))}
    </div>
  );
}