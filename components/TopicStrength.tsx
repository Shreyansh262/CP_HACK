'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { TopicStat } from '@/lib/scoring';

export default function TopicStrength({ stats }: { stats: TopicStat[] }) {
  // Show up to 10 topics, weakest first (already sorted by topicStrength()).
  const data = stats.slice(0, 10).map((s) => ({
    tag: s.tag.length > 14 ? s.tag.slice(0, 13) + '…' : s.tag,
    rate: s.rate !== null ? Math.round(s.rate * 100) : 0,
    attempted: s.attempted,
    solved: s.solved,
  }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Attempt more problems to see topic analysis.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 24)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="tag"
          width={90}
          tick={{ fill: '#a1a1aa', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          formatter={(v: any, _: unknown, props: { payload?: { attempted: number; solved: number } }) => [
            `${v}% (${props.payload?.solved ?? 0}/${props.payload?.attempted ?? 0})`,
            'Solve rate',
          ]}
          contentStyle={{
            background: '#18181b',
            border: '1px solid #3f3f46',
            fontSize: 11,
            borderRadius: 6,
          }}
        />
        <Bar dataKey="rate" radius={[0, 3, 3, 0]} maxBarSize={14}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.rate >= 70
                  ? '#22c55e'
                  : entry.rate >= 40
                  ? '#eab308'
                  : '#ef4444'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}