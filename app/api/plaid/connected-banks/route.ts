import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("plaid_items")
    .select("institution_name, plaid_item_id")
    .eq("user_id", TEST_USER_ID)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ banks: data })
}
