import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Problem } from '@/lib/types';
import ProblemView from './ProblemView';

export const dynamic = 'force-dynamic';

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('competitive_problems')
    .select(
      'id, source, external_id, title, problem_statement, difficulty, tags, hints, edge_cases, created_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-sm text-red-300">
        DB error: {error.message}
      </main>
    );
  }
  if (!data) return notFound();

  const problem = data as Problem;
  // Hints come back as JSONB. Defensively coerce and sort.
  const hints = Array.isArray(problem.hints)
    ? [...problem.hints].sort((a, b) => a.level - b.level)
    : [];

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            ← All problems
          </Link>
          <div className="text-sm font-medium">
            {problem.external_id && (
              <span className="mr-2 text-zinc-500">{problem.external_id}</span>
            )}
            {problem.title}
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          {problem.difficulty ?? '—'} · {(problem.tags ?? []).join(', ')}
        </div>
      </header>
      <ProblemView problem={{ ...problem, hints }} />
    </div>
  );
}
