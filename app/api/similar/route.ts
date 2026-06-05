import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

  // 2. Parse difficulty for range filter
  const diffNum  = ref.difficulty ? parseInt(ref.difficulty, 10) : null;
  const diffLow  = diffNum ? diffNum - 300 : null;
  const diffHigh = diffNum ? diffNum + 300 : null;

  // 3. Vector search via pgvector RPC
  const { data: similar, error: simErr } = await supabase.rpc('match_problems', {
    query_embedding: ref.embedding,
    match_count:     10,
    exclude_id:      id,
  });

  if (simErr) {
    console.error('[similar] RPC error:', simErr);
    return NextResponse.json({ error: 'Similarity search failed' }, { status: 500 });
  }

  // 4. Pick primary tag — skip CF meta-tags like *special
  const primaryTag = (ref.tags ?? []).find((t: string) => !t.startsWith('*'));

  // 5. Filter by difficulty range and tag overlap
  const filtered = (similar ?? [])
    .filter((row: { difficulty?: string; tags?: string[]; similarity: number }) => {
      if (diffLow && diffHigh) {
        const d = row.difficulty ? parseInt(row.difficulty, 10) : null;
        if (d && (d < diffLow || d > diffHigh)) return false;
      }
      if (primaryTag && row.tags?.length) {
        if (!row.tags.includes(primaryTag)) return false;
      }
      return true;
    })
    .slice(0, 5);

  return NextResponse.json({ similar: filtered });
}