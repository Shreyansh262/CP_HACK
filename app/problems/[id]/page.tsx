import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/supabase-server';
import ProblemView from './ProblemView';
import type { Hint } from '@/lib/types';

type Props = { params: Promise<{ id: string }> };

export default async function ProblemPage({ params }: Props) {
  const { id } = await params;

  // Fetch problem and user in parallel.
  const [problemResult, user] = await Promise.all([
    supabase
      .from('competitive_problems')
      .select('id, title, problem_statement, difficulty, tags, hints, edge_cases, external_id, source, created_at')
      .eq('id', id)
      .single(),
    getAuthUser(),
  ]);

  if (problemResult.error || !problemResult.data) notFound();

  const problem = problemResult.data;
  const hints: Hint[] = Array.isArray(problem.hints) ? problem.hints : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Problem header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Problems
        </a>
        <span className="text-xs text-zinc-600">·</span>
        <h1 className="truncate text-sm font-semibold text-zinc-100">
          {problem.external_id ? `${problem.external_id} · ` : ''}
          {problem.title}
        </h1>
        <span className="ml-auto text-xs text-zinc-500">
          {problem.difficulty ?? '—'} ·{' '}
          {[...new Set(problem.tags ?? [])].slice(0, 4).join(', ')}
        </span>
      </header>

      <ProblemView problem={{ ...problem, hints }} user={user} />
    </div>
  );
}