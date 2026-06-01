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
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: '#a1a1aa', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          formatter={(v: any) => [v, 'Solved']}
          contentStyle={{
            background: '#18181b',
            border: '1px solid #3f3f46',
            fontSize: 11,
            borderRadius: 6,
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {buckets.map((_, i) => (
            <Cell key={i} fill={BUCKET_COLORS[i] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}