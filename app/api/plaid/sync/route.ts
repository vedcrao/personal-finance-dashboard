import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { syncAndCategorize } from "@/lib/sync"

export const maxDuration = 60

/** Manual sync (Sync button). Webhooks and the daily cron use the same code path. */
export async function POST() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  try {
    const result = await syncAndCategorize(userId)
    const failed = result.items.filter((i) => i.error)
    return NextResponse.json({
      ...result,
      ...(failed.length ? { warning: failed.map((f) => `${f.institution}: ${f.error}`).join("; ") } : {}),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Sync error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
