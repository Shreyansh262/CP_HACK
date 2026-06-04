import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import UnseenProblemView from './UnseenProblemView';

// Admin client — bypasses RLS for problem fetch (read-only)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function UnseenProblemPage({ params }: Props) {
  const { id } = await params;

  const { data: problem } = await supabaseAdmin
    .from('unseen_problems')
    .select('id, title, problem_statement, constraints_text, sample_io, difficulty, tags, hints')
    .eq('id', id)
    .maybeSingle();

  if (!problem) notFound();

  // Create server-side Supabase client directly from @supabase/ssr.
  // We do this here rather than through lib/supabase-server because that helper
  // may not export a Server Component-compatible client (it was designed for API routes).
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},  // read-only in Server Component — no cookie writes needed
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  return <UnseenProblemView problem={problem} user={user} />;
}