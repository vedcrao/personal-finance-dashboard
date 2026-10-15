import { NextResponse } from "next/server"
import { applyCategorization, syncAndCategorize } from "@/lib/sync"

export const maxDuration = 60

/**
 * Daily safety-net sync (vercel.json cron) in case a webhook was missed.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const r = await syncAndCategorize(undefined, { budgetMs: 20_000 })
    const rest = r.remaining > 0 ? await applyCategorization("uncategorized", { budgetMs: 20_000 }) : null
    return NextResponse.json({ ...r, remaining: rest?.remaining ?? r.remaining })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 })
  }
}
