import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { isMissingSchema } from "@/lib/db-errors"
import type { BalanceSnapshot } from "@/lib/types"

/**
 * Daily balance history, summed per account type.
 *   ?since=YYYY-MM-DD  (optional)
 *   ?type=investment   (optional; repeatable)
 *   ?account=<uuid>    (optional; single account)
 */
export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const { searchParams } = new URL(request.url)
  const since = searchParams.get("since")
  const types = searchParams.getAll("type")
  const accountId = searchParams.get("account")

  let query = supabaseAdmin
    .from("balance_snapshots")
    .select("date, account_type, current_balance")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .limit(10000)

  if (since) query = query.gte("date", since)
  if (types.length) query = query.in("account_type", types)
  if (accountId) query = query.eq("account_id", accountId)

  const { data, error } = await query

  if (isMissingSchema(error)) return NextResponse.json({ snapshots: [], setupRequired: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totals = new Map<string, number>()
  for (const row of data ?? []) {
    const key = `${row.date}|${row.account_type}`
    totals.set(key, (totals.get(key) ?? 0) + Number(row.current_balance))
  }

  const snapshots: BalanceSnapshot[] = [...totals.entries()].map(([key, balance]) => {
    const [date, type] = key.split("|")
    return { date, type, balance }
  })

  return NextResponse.json({ snapshots })
}
