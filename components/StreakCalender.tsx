'use client';

import { useMemo, useState } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────

const CELL = 11;
const GAP = 2;
const WEEKS = 53;
const DAYS = 7;

// Colour by solve count per day.
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

/**
 * solvedByDay: YYYY-MM-DD → solve count (built in profile-queries)
 */
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
    // Start of the grid: Sunday of the week 52 weeks ago.
    const start = new Date(today);
    start.setDate(today.getDate() - WEEKS * 7 + 1);
    start.setDate(start.getDate() - start.getDay()); // rewind to Sunday

    const result: {
      date: string;
      count: number;
      col: number;
      row: number;
      future: boolean;
    }[] = [];

    const cur = new Date(start);
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < DAYS; row++) {
        const k = dayKey(cur);
        result.push({
          date: k,
          count: solvedByDay[k] ?? 0,
          col,
          row,
          future: cur > today,
        });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return result;
  }, [solvedByDay]);

  const svgWidth = WEEKS * (CELL + GAP);
  const svgHeight = DAYS * (CELL + GAP);

  // Day-of-week labels
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="relative overflow-x-auto">
      <div className="flex gap-1">
        {/* Day-of-week labels */}
        <div className="flex flex-col justify-around pr-1" style={{ height: svgHeight }}>
          {dayLabels.map((d, i) => (
            <span key={i} className="text-[9px] leading-none text-zinc-600">
              {i % 2 === 1 ? d : ''}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          height={svgHeight}
          className="overflow-visible"
        >
          {cells.map((cell) => (
            <rect
              key={cell.date}
              x={cell.col * (CELL + GAP)}
              y={cell.row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={cell.future ? 'transparent' : cellColor(cell.count)}
              className={cell.future ? '' : 'cursor-pointer transition-opacity hover:opacity-80'}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGRectElement).getBoundingClientRect();
                setTooltip({
                  date: cell.date,
                  count: cell.count,
                  x: rect.left,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-1 text-[9px] text-zinc-600">
        <span>Less</span>
        {[0, 1, 2, 3].map((n) => (
          <svg key={n} width={CELL} height={CELL}>
            <rect width={CELL} height={CELL} rx={2} fill={cellColor(n)} />
          </svg>
        ))}
        <span>More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}
        >
          {tooltip.date}: {tooltip.count} solved
        </div>
      )}
    </div>
  );
}