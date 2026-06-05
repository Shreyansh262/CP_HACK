import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/supabase-server';
import ProblemView from './ProblemView';
import type { Hint } from '@/lib/types';

type Props = { params: Promise<{ id: string }> };

export default async function ProblemPage({ params }: Props) {
  const { id } = await params;

  const [problemResult, user] = await Promise.all([
    supabase
      .from('competitive_problems')
      .select('id, source, external_id, title, problem_statement, difficulty, tags, hints, edge_cases, sample_io, created_at')
      .eq('id', id)
      .single(),
    getAuthUser(),
  ]);

  if (problemResult.error || !problemResult.data) notFound();

  const problem = problemResult.data;
  const hints: Hint[] = Array.isArray(problem.hints) ? problem.hints : [];

  return (
    // This div fills the remaining viewport below the sticky header.
    // overflow-hidden + min-h-0 forces the three inner panels to scroll
    // individually instead of the whole page scrolling.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Problem sub-header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Problems
        </Link>
        <span className="text-zinc-700">·</span>
        <h1 className="truncate text-sm font-semibold text-zinc-100">
          {problem.external_id ? `${problem.external_id} · ` : ''}
          {problem.title}
        </h1>
        <span className="ml-auto shrink-0 text-sm text-zinc-500">
          {problem.difficulty ?? '—'}
          {problem.tags && problem.tags.length > 0
            ? ' · ' + [...new Set(problem.tags)].slice(0, 3).join(', ')
            : ''}
        </span>
      </div>

      <ProblemView problem={{ ...problem, hints }} user={user} />
    </div>
  );
}

// Need Link import
import Link from 'next/link';