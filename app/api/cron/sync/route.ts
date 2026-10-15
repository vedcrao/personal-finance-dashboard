import { NextResponse } from "next/server"
import { applyCategorization, syncAndCategorize } from "@/lib/sync"
import { supabaseAdmin } from "@/lib/supabase-server"

export const maxDuration = 60

/**
 * Daily safety-net sync for every user (in case a webhook was missed).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Time-boxed: users not reached
 * today are picked up by their next webhook or tomorrow's run (oldest-synced first).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const started = Date.now()
  const { data: items } = await supabaseAdmin.from("plaid_items").select("user_id, last_synced_at").order("last_synced_at", { ascending: true, nullsFirst: true })
  const users = [...new Set((items ?? []).map((i) => i.user_id as string))]
  const done: { user: string; synced?: number; error?: string }[] = []

  for (const userId of users) {
    if (Date.now() - started > 45_000) break
    try {
      const r = await syncAndCategorize(userId, undefined, { budgetMs: 8_000 })
      if (r.remaining > 0 && Date.now() - started < 40_000) await applyCategorization(userId, "uncategorized", { budgetMs: 8_000 })
      done.push({ user: userId.slice(0, 8), synced: r.synced })
    } catch (e) {
      done.push({ user: userId.slice(0, 8), error: e instanceof Error ? e.message : "failed" })
    }
  }
  return NextResponse.json({ users: users.length, processed: done })
}
