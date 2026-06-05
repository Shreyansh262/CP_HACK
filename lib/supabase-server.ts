import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

/**
 * Per-request Supabase client that reads/writes auth cookies.
 * Use in Server Components, API Routes, and Middleware.
 * Uses NEXT_PUBLIC vars because the anon key is safe to expose.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Server Component — can't set cookies; safe to ignore.
              // The middleware will handle cookie refresh.
            }
          });
        },
      },
    }
  );
}

/**
 * Authenticated user or null. Wrapped in React cache() so multiple callers in
 * one request (e.g. layout + page) share a single getUser() round-trip (#14).
 */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});