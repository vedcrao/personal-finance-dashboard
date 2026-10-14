import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/session"

/**
 * Password gate for the deployed app. Every API route reads/changes your
 * financial data with the Supabase service key, so they must not be public.
 * - APP_PASSWORD unset (local dev) → no gate
 * - Plaid webhook (signature-verified) and Vercel cron (CRON_SECRET) stay reachable
 */
const PUBLIC_EXACT = new Set(["/login", "/api/login", "/api/plaid/webhook"]) // note: /api/plaid/webhook/register stays protected
const PUBLIC_PREFIX = ["/api/cron/"]

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.next()

  const { pathname, search } = request.nextUrl
  if (PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? ""
  if (cookie && safeEqual(cookie, sessionToken(password))) return NextResponse.next()

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL("/login", request.url)
  url.searchParams.set("next", pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
