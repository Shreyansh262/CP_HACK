'use client';

import type { ProgressRow } from '@/lib/profile-queries';

function StatusBadge({ status }: { status: string }) {
  if (status === 'solved')
    return (
      <span className="shrink-0 rounded bg-green-950 px-1.5 py-0.5 text-[13px] font-medium text-green-400">
        Solved
      </span>
    );
  if (status === 'given_up')
    return (
      <span className="shrink-0 rounded bg-red-950 px-1.5 py-0.5 text-[13px] font-medium text-red-400">
        Given up
      </span>
    );
  return (
    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] font-medium text-zinc-400">
      Attempted
    </span>
  );
}

function fmtTime(secs: number): string {
  // Heartbeat time can legitimately be 0 (e.g. solved without the tab focused
  // long enough). Show N/A rather than a misleading "0s".
  if (!secs) return 'N/A';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtDate(iso: string): string {
  // Pin the locale + timezone so the server and client render identical text
  // (an unpinned locale formats e.g. "Jun 7" on the server but "7 Jun" on the
  // client, causing a hydration mismatch).
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

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
      {rows.map((row) => {
        const isUnseen = !!row.unseen_problem_id;
        const href = isUnseen
          ? `/problems/unseen/${row.unseen_problem_id}`
          : `/problems/seen/${row.problem_id}`;
        const title = isUnseen
          ? row.unseen_problems?.title ?? 'Unseen problem'
          : row.competitive_problems?.title ?? 'Unknown problem';
        const externalId = isUnseen ? null : row.competitive_problems?.external_id;

        return (
          <a
            key={row.id}
            href={href}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm text-zinc-200">
                {externalId ? `${externalId} · ` : ''}
                {title}
              </span>
              <div className="mt-0.5 flex flex-wrap gap-3 text-[13px] text-zinc-500">
                <span>⏱ {fmtTime(row.time_spent_seconds)}</span>
                {row.hints_used > 0 && (
                  <span>
                    💡 {row.hints_used} hint{row.hints_used !== 1 ? 's' : ''}
                  </span>
                )}
                {(row.tier1_calls > 0 || row.tier2_calls > 0) && (
                  <span>
                    AI <span className="text-blue-700 dark:text-blue-400">{row.tier1_calls} quick</span>
                    {' · '}
                    <span className="text-violet-700 dark:text-violet-400">{row.tier2_calls} deep</span>
                  </span>
                )}
                <span>{fmtDate(row.updated_at)}</span>
              </div>
            </div>

            <StatusBadge status={row.status} />
          </a>
        );
      })}
    </div>
  );
}