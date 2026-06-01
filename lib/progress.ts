import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { supabase as supabaseAdmin } from '@/lib/supabase';

/**
 * Resolve the authenticated user for a progress route.
 * Returns either { userId } on success or a NextResponse to return directly.
 *
 * Pattern: read auth from the SSR cookie client (trustworthy), then perform
 * writes via the service-role admin client (bypasses RLS, atomic).
 */
export async function requireUser(): Promise<
  | { userId: string; admin: typeof supabaseAdmin }
  | { error: NextResponse }
> {
  const sb = await createSupabaseServer();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  return { userId: user.id, admin: supabaseAdmin };
}

/** UUID v4-ish shape check (Supabase always returns v4). */
export function isUuid(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}