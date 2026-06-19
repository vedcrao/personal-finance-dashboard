import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select("id, name, type, subtype, mask, plaid_item_id, billing_cycle_day")
    .eq("user_id", TEST_USER_ID)
    .order("type", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Join with plaid_items to get institution name
  const { data: items } = await supabaseAdmin
    .from("plaid_items")
    .select("plaid_item_id, institution_name")
    .eq("user_id", TEST_USER_ID)

  const itemMap = new Map(items?.map((i) => [i.plaid_item_id, i.institution_name]) ?? [])

  const accounts = data.map((a) => ({
    ...a,
    institution_name: itemMap.get(a.plaid_item_id) ?? "Unknown",
  }))

  return NextResponse.json({ accounts })
}
