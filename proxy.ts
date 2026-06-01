import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // We need a mutable response so we can update cookies.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror cookies onto the request (for downstream reads)…
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // …and onto the response (so the browser gets them).
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT with the Supabase server — don't skip this.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Auth guard ───────────────────────────────────────────────────────────────
  // All LLM-backed routes require a signed-in user.
  // Anonymous users can still browse problems and see stored hints.
  if (request.nextUrl.pathname.startsWith('/api/review') && !user) {
    return NextResponse.json(
      { error: 'Sign in to use AI tutor features.' },
      { status: 401 }
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     *  - Next.js internals (_next/static, _next/image)
     *  - favicon and static image files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};