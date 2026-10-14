import { NextResponse } from "next/server"
import { syncAndCategorize } from "@/lib/sync"

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
    return NextResponse.json(await syncAndCategorize())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 })
  }
}
