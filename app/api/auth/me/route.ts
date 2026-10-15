import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { encryptSecret } from "@/lib/crypto"
import { forgetPlaidClient, verifyPlaidKeys, type PlaidEnv } from "@/lib/plaid"
import { isOwner } from "@/lib/user"

/** GET → who's signed in + their Plaid key status (never the secret itself) */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { data } = await supabaseAdmin.from("plaid_credentials").select("client_id, environment, updated_at").eq("user_id", auth.id).maybeSingle()
  return NextResponse.json({
    username: auth.username,
    email: auth.email,
    owner: isOwner(auth.email),
    plaid: data ? { client_id: `${data.client_id.slice(0, 6)}…${data.client_id.slice(-4)}`, environment: data.environment, updated_at: data.updated_at } : null,
  })
}

/** PUT { plaid_client_id, plaid_secret, plaid_env } → replace Plaid keys (verified first) */
export async function PUT(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await request.json().catch(() => ({}))
  const clientId = String(body.plaid_client_id ?? "").trim()
  const secret = String(body.plaid_secret ?? "").trim()
  const env: PlaidEnv = body.plaid_env === "production" ? "production" : "sandbox"
  if (!/^[a-f0-9]{24}$/i.test(clientId) || !/^[a-f0-9]{30}$/i.test(secret)) {
    return NextResponse.json({ error: "client_id is 24 and secret is 30 hex characters" }, { status: 400 })
  }
  const err = await verifyPlaidKeys(clientId, secret, env)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("plaid_credentials")
    .upsert({ user_id: auth.id, client_id: clientId, secret_ciphertext: encryptSecret(secret), environment: env, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  forgetPlaidClient(auth.id)
  return NextResponse.json({ ok: true })
}
