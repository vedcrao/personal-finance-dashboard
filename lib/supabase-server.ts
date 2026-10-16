import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

function getAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("Supabase server credentials are not set (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

/**
 * Service-role client: bypasses RLS, server-side only (API routes always filter by the
 * signed-in user's id). Created on first use so pure logic that imports this module can be
 * loaded (and unit-tested) without credentials.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = getAdmin() as unknown as Record<PropertyKey, unknown>
    const value = real[prop]
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
