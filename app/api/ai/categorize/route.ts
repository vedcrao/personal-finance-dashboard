import { NextResponse } from "next/server"
import { applyCategorization } from "@/lib/sync"

export const maxDuration = 60

/**
 * POST {}                 → categorize anything without a category
 * POST { mode: "all" }    → re-run rules / Plaid categories / LLM on everything you haven't edited by hand
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const mode = body?.mode === "all" ? "all" : "uncategorized"
  try {
    return NextResponse.json(await applyCategorization(mode))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Categorize error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
