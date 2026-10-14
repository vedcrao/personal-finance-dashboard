import { createHmac, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "vertice_session"

/** Deterministic session token derived from APP_PASSWORD (rotating the password logs everyone out). */
export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("vertice-session-v1").digest("hex")
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
