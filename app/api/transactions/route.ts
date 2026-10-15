import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { isMissingSchema } from "@/lib/db-errors"

const BASE = "id, account_id, amount, merchant_name, description, date, category, is_anomaly, city, region, country"
const AUTOMATION = `${BASE}, pending, flow_override, category_source, reimburses:raw_data->vertice_reimburses`

export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const accountId = new URL(request.url).searchParams.get("account_id")

  const run = async (columns: string) => {
    const rows: Record<string, unknown>[] = []
    // PostgREST caps responses at 1000 rows — page through everything
    for (let from = 0; ; from += 1000) {
      let q = supabaseAdmin.from("transactions").select(columns).eq("user_id", userId)
      if (accountId) q = q.eq("account_id", accountId)
      const { data, error } = await q.order("date", { ascending: false }).order("id").range(from, from + 999)
      if (error) return { rows, error }
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
      if (!data || data.length < 1000) return { rows, error: null }
    }
  }

  let res = await run(AUTOMATION)
  if (isMissingSchema(res.error)) res = await run(BASE)
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })

  return NextResponse.json({
    transactions: res.rows.map((t) => ({ pending: false, flow_override: null, category_source: null, ...t })),
  })
}
