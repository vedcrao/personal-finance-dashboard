import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { applyCategorization } from "@/lib/sync"

export const maxDuration = 60

/**
 * POST {}                 → categorize anything without a category
 * POST { mode: "all", since? } → re-run rules / Plaid / LLM on everything you haven't edited by hand
 * Both return { categorized, remaining, since }; repeat while remaining > 0.
 */
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const body = await request.json().catch(() => ({}))
  const mode = body?.mode === "all" ? "all" : "uncategorized"
  const since = typeof body?.since === "string" ? body.since : undefined
  try {
    // Time-boxed; the client calls again with the returned `since` until remaining === 0
    return NextResponse.json(await applyCategorization(userId, mode, { since }))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Categorize error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
