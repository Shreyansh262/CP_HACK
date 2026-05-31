import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
 * Convenience: return the authenticated user or null.
 */
export async function getAuthUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}