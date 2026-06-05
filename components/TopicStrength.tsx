'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { CategoryStat } from '@/lib/profile-queries';
import { OTHER_CATEGORY } from '@/lib/topic-categories';

// Distinct accent palette; 'Other' is forced to a muted grey to de-emphasise it.
const COLORS = [
  '#6366f1', '#22c55e', '#eab308', '#06b6d4', '#ec4899',
  '#f97316', '#8b5cf6', '#14b8a6', '#3b82f6', '#a3e635', '#f43f5e',
];
const OTHER_COLOR = '#52525b';

type Slice = { name: string; value: number };

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 6, padding: '4px 8px', color: '#e4e4e7' }}>
      {p.name} — {p.value} solved
    </div>
  );
}

export default function TopicStrength({ stats }: { stats: CategoryStat[] }) {
  // Only categories the user has actually solved something in (a pie of zero
  // slices is meaningless).
  const data: Slice[] = stats
    .filter((s) => s.solved > 0)
    .map((s) => ({ name: s.category, value: s.solved }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Solve some problems to see your topic breakdown.
      </p>
    );
  }

  // Show the category name on the slice only when it's wide enough (~5%);
  // thin slices omit the label rather than overlap.
  const renderLabel = ({ name, percent }: { name?: string; percent?: number }) =>
    (percent ?? 0) >= 0.05 ? name ?? '' : '';

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={95}
          label={renderLabel}
          labelLine={false}
          stroke="#18181b"
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell
              key={d.name}
              fill={d.name === OTHER_CATEGORY ? OTHER_COLOR : COLORS[i % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<PieTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
