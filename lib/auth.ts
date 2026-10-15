import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "./supabase-server"

/** Supabase client bound to the request's auth cookies (Route Handlers / Server Components). */
export async function supabaseServer() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them
        }
      },
    },
  })
}

export interface SessionUser {
  id: string
  email: string
  username: string | null
}

/** The signed-in user, verified with Supabase Auth (not just a decoded cookie). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const { data: profile } = await supabaseAdmin.from("profiles").select("username").eq("id", data.user.id).maybeSingle()
  return { id: data.user.id, email: data.user.email ?? "", username: profile?.username ?? null }
}

/**
 * For API routes:
 *   const auth = await requireUser(); if (auth instanceof NextResponse) return auth
 *   const userId = auth.id
 */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  return user ?? NextResponse.json({ error: "Not signed in" }, { status: 401 })
}

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/

/** Signed-in user's Plaid client, or a JSON error response (not signed in / no keys saved). */
export async function requirePlaid(userId: string) {
  const { getPlaidClient, MissingPlaidKeysError } = await import("./plaid")
  try {
    return await getPlaidClient(userId)
  } catch (e) {
    if (e instanceof MissingPlaidKeysError) return NextResponse.json({ error: e.message, code: "NO_PLAID_KEYS" }, { status: 409 })
    throw e
  }
}
