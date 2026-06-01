'use client';

// These must match lib/quota.ts constants.
const TIER1_DAILY = 20;
const TIER2_DAILY = 5;

function UsageBar({
  label,
  used,
  total,
  remaining,
  color,
}: {
  label: string;
  used: number;
  total: number;
  remaining: number;
  color: 'blue' | 'purple';
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const barFill = color === 'blue' ? 'bg-blue-500' : 'bg-purple-500';
  const trackFill = color === 'blue' ? 'bg-blue-950' : 'bg-purple-950';

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-500">
          {remaining} of {total} left today
        </span>
      </div>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackFill}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${barFill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AIUsageToday({
  t1Remaining,
  t2Remaining,
  activeTier,
}: {
  t1Remaining: number;
  t2Remaining: number;
  activeTier: string;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <UsageBar
        label="⚡ Quick Review"
        used={TIER1_DAILY - t1Remaining}
        total={TIER1_DAILY}
        remaining={t1Remaining}
        color="blue"
      />
      <UsageBar
        label="🔬 Deep Analysis"
        used={TIER2_DAILY - t2Remaining}
        total={TIER2_DAILY}
        remaining={t2Remaining}
        color="purple"
      />
      {activeTier === 'zero' && (
        <p className="text-xs text-amber-500">
          All AI tokens used for today. Resets at midnight UTC.
        </p>
      )}
      {activeTier === 'quick' && t2Remaining === 0 && (
        <p className="text-xs text-zinc-600">
          Deep Analysis quota used. Quick Review still available.
        </p>
      )}
    </div>
  );
}