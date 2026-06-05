'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DifficultyBucket } from '@/lib/profile-queries';

// Map difficulty label to a colour gradient (easy=green → hard=red).
const BUCKET_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

function HistTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11, borderRadius: 6, padding: '4px 8px', color: '#e4e4e7' }}>
      Rating {label} — {payload[0].value} solved
    </div>
  );
}

export default function DifficultyHistogram({
  buckets,
}: {
  buckets: DifficultyBucket[];
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500">No solved problems yet.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 28, left: 8 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: '#a1a1aa', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: 'Codeforces rating',
            position: 'insideBottom',
            offset: -16,
            fill: '#71717a',
            fontSize: 11,
          }}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={36}
          label={{
            value: 'Problems solved',
            angle: -90,
            position: 'insideLeft',
            fill: '#71717a',
            fontSize: 11,
            style: { textAnchor: 'middle' },
          }}
        />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={<HistTooltip />} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {buckets.map((_, i) => (
            <Cell key={i} fill={BUCKET_COLORS[i] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
