import { notFound } from 'next/navigation';
import { createSupabaseServer, getAuthUser } from '@/lib/supabase-server';
import UnseenProblemView from './UnseenProblemView';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function UnseenProblemPage({ params }: Props) {
  const { id } = await params;
  const db = await createSupabaseServer();

  const [{ data: problem }, user] = await Promise.all([
    db
      .from('unseen_problems')
      .select('id, title, problem_statement, constraints_text, sample_io, difficulty, tags, hints')
      .eq('id', id)
      .maybeSingle(),
    getAuthUser(),
  ]);

  if (!problem) notFound();

  return <UnseenProblemView problem={problem} user={user} />;
}