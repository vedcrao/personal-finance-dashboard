import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM for secrets at rest (users' Plaid secrets).
 * CREDENTIALS_ENCRYPTION_KEY = 32 random bytes, base64 or hex:  openssl rand -base64 32
 * Output format: v1.<iv>.<tag>.<ciphertext> (base64url parts)
 */
function key(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set (generate with: openssl rand -base64 32)")
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64")
  if (k.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes")
  return k
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".")
}

export function decryptSecret(token: string): string {
  const [v, iv, tag, ct] = token.split(".")
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized ciphertext format")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8")
}
