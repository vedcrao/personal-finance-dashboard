import { Configuration, CountryCode, PlaidApi, PlaidEnvironments } from "plaid"
import { supabaseAdmin } from "./supabase-server"
import { decryptSecret } from "./crypto"

export type PlaidEnv = "sandbox" | "production"

export function makePlaidClient(clientId: string, secret: string, env: PlaidEnv): PlaidApi {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
    })
  )
}

export class MissingPlaidKeysError extends Error {
  constructor() {
    super("Add your Plaid API keys in Connect → Plaid keys before linking banks.")
  }
}

// Decrypted clients cached per server instance for a few minutes
const cache = new Map<string, { client: PlaidApi; env: PlaidEnv; at: number }>()
const TTL = 5 * 60_000

// Test-only: integration tests swap in a fake Plaid (never set in the app)
let override: ((userId: string) => PlaidApi) | null = null
export function __setPlaidClientForTests(fn: ((userId: string) => PlaidApi) | null) {
  if (process.env.NODE_ENV === "production") throw new Error("not available in production")
  override = fn
}

/** Plaid client using the signed-in user's own API keys (stored encrypted at signup). */
export async function getPlaidClient(userId: string): Promise<PlaidApi> {
  if (override) return override(userId)
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL) return hit.client

  const { data } = await supabaseAdmin
    .from("plaid_credentials")
    .select("client_id, secret_ciphertext, environment")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) throw new MissingPlaidKeysError()

  const env = data.environment as PlaidEnv
  const client = makePlaidClient(data.client_id, decryptSecret(data.secret_ciphertext), env)
  cache.set(userId, { client, env, at: Date.now() })
  return client
}

export function forgetPlaidClient(userId: string) {
  cache.delete(userId)
}

/** Cheap call that fails fast on wrong keys / wrong environment. */
export async function verifyPlaidKeys(clientId: string, secret: string, env: PlaidEnv): Promise<string | null> {
  try {
    await makePlaidClient(clientId, secret, env).institutionsGet({ count: 1, offset: 0, country_codes: [CountryCode.Us] })
    return null
  } catch (e) {
    const d = (e as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data
    if (d?.error_code === "INVALID_API_KEYS") return `Plaid rejected these keys for the ${env} environment. Check the client ID, the ${env} secret, and that you picked the matching environment.`
    return d?.error_message ?? "Couldn't reach Plaid to verify the keys."
  }
}
