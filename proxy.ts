import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Supabase Auth gate + session refresh for every request.
 * Public: sign-in / sign-up pages and endpoints, the email-confirmation callback,
 * Plaid's webhook (signature-verified per user) and the Vercel cron (CRON_SECRET).
 */
const PUBLIC_EXACT = new Set(["/login", "/signup", "/privacy", "/terms", "/support", "/auth/callback", "/api/auth/login", "/api/auth/signup", "/api/plaid/webhook"])
const PUBLIC_PREFIX = ["/api/cron/"]

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isPublic = PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))

  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Verifies the JWT (and refreshes it when needed); don't trust the cookie blindly
  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims?.sub

  if (isPublic) {
    // Already signed in? Skip the auth pages
    if (signedIn && (pathname === "/login" || pathname === "/signup")) return NextResponse.redirect(new URL("/", request.url))
    return response
  }
  if (signedIn) return response

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const url = new URL("/login", request.url)
  if (pathname !== "/") url.searchParams.set("next", pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|apple-touch-icon.png).*)"],
}
