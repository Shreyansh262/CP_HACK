import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

/**
 * GET /api/similar?id=<uuid>&source=seeded|unseen
 *
 * Returns up to 5 similar problems by cosine similarity.
 * Filters: same primary tag, rating ±300.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id     = searchParams.get('id');
  const source = searchParams.get('source') ?? 'seeded';

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = await createSupabaseServer();

  // 1. Fetch the reference problem's embedding + metadata
  const table = source === 'unseen' ? 'unseen_problems' : 'competitive_problems';
  const { data: ref, error: refErr } = await supabase
    .from(table)
    .select('embedding, tags, difficulty')
    .eq('id', id)
    .maybeSingle();

  if (refErr || !ref) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
  }

  if (!ref.embedding) {
    // Not embedded yet — return empty (Phase 5 embeddings may still be running)
    return NextResponse.json({ similar: [] });
  }

  // 2. Difficulty band (±300) used as a ranking preference, not a hard cutoff.
  const refDiff  = ref.difficulty != null ? Number(ref.difficulty) : null;
  const diffLow  = refDiff != null && !Number.isNaN(refDiff) ? refDiff - 300 : null;
  const diffHigh = refDiff != null && !Number.isNaN(refDiff) ? refDiff + 300 : null;

  // 3. Vector search — pull a generous candidate pool; we rank/trim below.
  const { data: similar, error: simErr } = await supabase.rpc('match_problems', {
    query_embedding: ref.embedding,
    match_count:     50,
    exclude_id:      id,
  });

  if (simErr) {
    console.error('[similar] RPC error:', simErr);
    return NextResponse.json({ error: 'Similarity search failed' }, { status: 500 });
  }

  type Candidate = {
    difficulty?: string | number | null;
    tags?: string[];
    similarity: number;
  };
  const candidates = (similar ?? []) as Candidate[];

  // 4. Tag overlap + difficulty band are PREFERENCES, not hard filters. Hard
  //    AND-filtering over the nearest 10 used to drop everything whenever a
  //    problem's neighbours didn't share its one primary tag — that's the
  //    "sometimes all, sometimes nothing" bug. Instead we rank:
  //      shared tag (+2)  +  in difficulty band (+1)  then raw similarity.
  //    The RPC already returns rows sorted by similarity, so a stable sort by
  //    rank keeps the nearest within each tier. This always returns up to 5
  //    when any neighbours exist.
  const refTags = new Set((ref.tags ?? []).filter((t: string) => !t.startsWith('*')));
  const sharesTag = (c: Candidate) => !!c.tags?.some((t) => refTags.has(t));
  const inBand = (c: Candidate) => {
    if (diffLow == null || diffHigh == null) return true;
    const d = c.difficulty != null ? Number(c.difficulty) : NaN;
    if (Number.isNaN(d)) return true; // unknown difficulty shouldn't disqualify
    return d >= diffLow && d <= diffHigh;
  };
  const rank = (c: Candidate) => (sharesTag(c) ? 2 : 0) + (inBand(c) ? 1 : 0);

  const ranked = candidates
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.c)
    .slice(0, 5);

  return NextResponse.json({ similar: ranked });
}