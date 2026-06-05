'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SimilarProblem {
  id: string;
  title: string;
  difficulty: string | null;
  tags: string[];
  external_id: string | null;
  similarity: number;
}

interface Props {
  problemId: string;
  source?: 'seeded' | 'unseen';
}

export default function SimilarProblems({ problemId, source = 'seeded' }: Props) {
  const [problems, setProblems] = useState<SimilarProblem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/similar?id=${problemId}&source=${source}`)
      .then((r) => r.json())
      .then((data: { similar?: SimilarProblem[] }) => {
        if (!cancelled) {
          setProblems(data.similar ?? []);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [problemId, source]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-zinc-800" />
        ))}
      </div>
    );
  }

  if (problems.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No similar problems found for this one yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {problems.map((p) => {
        const href = source === 'unseen'
          ? `/problems/unseen/${p.id}`
          : `/problems/seen/${p.id}`;

        const diffNum = p.difficulty ? parseInt(p.difficulty, 10) : null;
        const diffColor = !diffNum
          ? 'text-zinc-500'
          : diffNum < 1400 ? 'text-green-500'
          : diffNum < 1800 ? 'text-yellow-500'
          : diffNum < 2200 ? 'text-orange-500'
          : 'text-red-500';

        return (
          <Link
            key={p.id}
            href={href}
            className="flex items-center justify-between rounded border border-zinc-800
                       px-3 py-2 text-xs hover:border-zinc-700 hover:bg-zinc-900
                       transition-colors group"
          >
            <span className="text-zinc-300 group-hover:text-zinc-100 truncate max-w-[70%]">
              {p.title}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {p.difficulty && (
                <span className={`font-mono ${diffColor}`}>{p.difficulty}</span>
              )}
              <span className="text-zinc-600 font-mono">
                {Math.round(p.similarity * 100)}%
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}