'use client';

import { useMemo, useState } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────

const CELL = 11;
const GAP = 2;
const WEEKS = 53;

function cellColor(count: number): string {
  if (count === 0) return '#27272a';  // zinc-800
  if (count === 1) return '#166534';  // green-800
  if (count === 2) return '#16a34a';  // green-600
  return '#22c55e';                   // green-500 (3+)
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StreakCalendar({
  solvedByDay,
}: {
  solvedByDay: Record<string, number>;
}) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the Saturday of the current week (end of current week column)
    const todayDow = today.getDay(); // 0=Sun … 6=Sat
    const endOfGrid = new Date(today);
    endOfGrid.setDate(today.getDate() + (6 - todayDow)); // advance to Saturday

    // Start of grid = 53 weeks back from endOfGrid, on a Sunday
    const startOfGrid = new Date(endOfGrid);
    startOfGrid.setDate(endOfGrid.getDate() - WEEKS * 7 + 1); // +1 → Sunday

    const result: { date: string; count: number; col: number; row: number; isFuture: boolean }[] = [];

    for (let week = 0; week < WEEKS; week++) {
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(startOfGrid);
        d.setDate(startOfGrid.getDate() + week * 7 + dow);
        const key = dayKey(d);
        const isFuture = d > today;
        result.push({
          date: key,
          count: isFuture ? 0 : (solvedByDay[key] ?? 0),
          col: week,
          row: dow,
          isFuture,
        });
      }
    }

    return result;
  }, [solvedByDay]);

  // Month labels: find first week where month changes
  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (const cell of cells) {
      if (cell.row !== 0) continue;
      const month = new Date(cell.date).getMonth();
      if (month !== lastMonth) {
        labels.push({
          label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(cell.date)),
          col: cell.col,
        });
        lastMonth = month;
      }
    }
    return labels;
  }, [cells]);

  const svgWidth = WEEKS * (CELL + GAP) - GAP;
  const svgHeight = 7 * (CELL + GAP) - GAP + 18; // +18 for month labels at top

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="block"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Month labels */}
        {monthLabels.map(({ label, col }) => (
          <text
            key={`${label}-${col}`}
            x={col * (CELL + GAP)}
            y={10}
            fontSize={9}
            fill="#71717a"
          >
            {label}
          </text>
        ))}

        {/* Cells */}
        {cells.map((cell) => (
          <rect
            key={cell.date}
            x={cell.col * (CELL + GAP)}
            y={18 + cell.row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx={2}
            fill={cell.isFuture ? 'transparent' : cellColor(cell.count)}
            stroke={cell.isFuture ? '#3f3f46' : 'none'}
            strokeWidth={cell.isFuture ? 1 : 0}
            style={{ cursor: cell.isFuture ? 'default' : 'pointer' }}
            onMouseEnter={(e) => {
              if (cell.isFuture) return;
              const svg = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
              const rect = (e.target as SVGElement).getBoundingClientRect();
              setTooltip({
                date: cell.date,
                count: cell.count,
                x: rect.left - svg.left + CELL / 2,
                y: rect.top - svg.top - 6,
              });
            }}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={Math.min(tooltip.x - 40, svgWidth - 85)}
              y={tooltip.y - 24}
              width={84}
              height={20}
              rx={3}
              fill="#18181b"
              stroke="#3f3f46"
              strokeWidth={1}
            />
            <text
              x={Math.min(tooltip.x - 40, svgWidth - 85) + 42}
              y={tooltip.y - 10}
              fontSize={9}
              fill="#d4d4d8"
              textAnchor="middle"
            >
              {tooltip.date} · {tooltip.count} solved
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-zinc-500">
        <span>Less</span>
        {[0, 1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-2.5 w-2.5 rounded-xs"
            style={{ backgroundColor: cellColor(n) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}