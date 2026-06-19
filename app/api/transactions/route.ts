import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  let query = supabaseAdmin
    .from("transactions")
    .select("id, account_id, amount, merchant_name, description, date, category, is_anomaly, city, region, country")
    .eq("user_id", TEST_USER_ID)
    .order("date", { ascending: false })

  if (accountId) query = query.eq("account_id", accountId)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data })
}
