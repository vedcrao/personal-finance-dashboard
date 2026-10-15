import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto"
import type { PlaidApi } from "plaid"

/**
 * Verifies the `Plaid-Verification` header (ES256 JWT) per
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 * Without this, anyone who learns the webhook URL could trigger syncs.
 */
const keyCache = new Map<string, KeyObject>()

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")

async function getKey(plaidClient: PlaidApi, kid: string): Promise<KeyObject> {
  const cached = keyCache.get(kid)
  if (cached) return cached
  const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid })
  const jwk = res.data.key
  if (jwk.expired_at) throw new Error("Webhook verification key expired")
  const key = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: "jwk" })
  keyCache.set(kid, key)
  return key
}

/** plaidClient = the client of the Plaid account that owns the Item (each user has their own keys). */
export async function verifyPlaidWebhook(plaidClient: PlaidApi, rawBody: string, token: string | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false
  const [h, p, s] = parts

  try {
    const header = JSON.parse(b64url(h).toString("utf8"))
    if (header.alg !== "ES256" || typeof header.kid !== "string") return false

    const key = await getKey(plaidClient, header.kid)
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, b64url(s))
    if (!ok) return false

    const payload = JSON.parse(b64url(p).toString("utf8"))
    if (typeof payload.iat !== "number" || Date.now() / 1000 - payload.iat > 5 * 60) return false

    const expected = Buffer.from(String(payload.request_body_sha256 ?? ""), "utf8")
    const actual = Buffer.from(createHash("sha256").update(rawBody).digest("hex"), "utf8")
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch (e) {
    console.warn("Webhook verification failed:", e instanceof Error ? e.message : e)
    return false
  }
}
