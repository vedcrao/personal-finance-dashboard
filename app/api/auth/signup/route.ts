import { NextResponse } from "next/server"
import { supabaseServer, USERNAME_RE } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { encryptSecret } from "@/lib/crypto"
import { verifyPlaidKeys, type PlaidEnv } from "@/lib/plaid"
import { claimLegacyData } from "@/lib/legacy"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST { username, email, password, plaid_client_id, plaid_secret, plaid_env }
 * → { status: "signed_in" } or { status: "confirm_email" }
 * Plaid keys are verified against Plaid before the account is created.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const username = String(body.username ?? "").trim().toLowerCase()
  const email = String(body.email ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")
  const clientId = String(body.plaid_client_id ?? "").trim()
  const secret = String(body.plaid_secret ?? "").trim()
  const env: PlaidEnv = body.plaid_env === "production" ? "production" : "sandbox"

  const fail = (error: string, field?: string, status = 400) => NextResponse.json({ error, field }, { status })
  if (body.accepted_terms !== true) return fail("Please accept the Terms and Privacy Policy to continue")
  if (!USERNAME_RE.test(username)) return fail("Username must be 3–24 characters: letters, numbers or _", "username")
  if (!EMAIL_RE.test(email)) return fail("Enter a valid email", "email")
  if (password.length < 8) return fail("Password must be at least 8 characters", "password")
  if (!/^[a-f0-9]{24}$/i.test(clientId)) return fail("That doesn't look like a Plaid client_id (24 hex characters)", "plaid_client_id")
  if (!/^[a-f0-9]{30}$/i.test(secret)) return fail("That doesn't look like a Plaid secret (30 hex characters)", "plaid_secret")

  const [{ data: taken }, { data: emailTaken }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle(),
    supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle(),
  ])
  if (taken) return fail("That username is taken", "username", 409)
  if (emailTaken) return fail("An account with this email already exists. Log in instead.", "email", 409)

  const plaidError = await verifyPlaidKeys(clientId, secret, env)
  if (plaidError) return fail(plaidError, "plaid_secret")

  let ciphertext: string
  try {
    ciphertext = encryptSecret(secret)
  } catch (e) {
    console.error(e)
    return fail("Server isn't configured to store keys (CREDENTIALS_ENCRYPTION_KEY missing).", undefined, 500)
  }

  const supabase = await supabaseServer()
  const origin = new URL(request.url).origin
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, accepted_terms_at: new Date().toISOString() }, emailRedirectTo: `${origin}/auth/callback?next=/connect` },
  })
  if (error) return fail(error.message, error.message.toLowerCase().includes("password") ? "password" : "email")
  const user = data.user
  // With confirmations on, Supabase returns a user with no identities for an existing email
  if (!user || user.identities?.length === 0) return fail("An account with this email already exists. Log in instead.", "email", 409)

  const [p, c] = await Promise.all([
    supabaseAdmin.from("profiles").insert({ id: user.id, username, email }),
    supabaseAdmin.from("plaid_credentials").upsert({ user_id: user.id, client_id: clientId, secret_ciphertext: ciphertext, environment: env }),
  ])
  if (p.error || c.error) {
    // Don't leave a half-created account behind
    await supabaseAdmin.auth.admin.deleteUser(user.id)
    const msg = (p.error ?? c.error)!.message
    return fail(msg.includes("relation") || msg.includes("schema cache") ? "Run supabase/migrations/20261017_multi_user.sql first." : msg, undefined, 500)
  }

  if (data.session) {
    await claimLegacyData({ id: user.id, email })
    return NextResponse.json({ status: "signed_in" })
  }
  return NextResponse.json({ status: "confirm_email" })
}
