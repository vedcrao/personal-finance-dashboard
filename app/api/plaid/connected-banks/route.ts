import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { plaidClient } from "@/lib/plaid"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema } from "@/lib/db-errors"

/** Connected institutions + sync health + which extra permissions each one is missing. */
interface ItemRow {
  institution_name: string
  plaid_item_id: string
  plaid_access_token: string
  last_synced_at?: string | null
  status?: string
  status_detail?: string | null
}

async function loadItems(columns: string) {
  return supabaseAdmin
    .from("plaid_items")
    .select(columns)
    .eq("user_id", TEST_USER_ID)
    .order("created_at", { ascending: true })
    .returns<ItemRow[]>()
}

export async function GET() {
  let res = await loadItems("institution_name, plaid_item_id, plaid_access_token, last_synced_at, status, status_detail")
  // Automation migration not run yet
  if (isMissingSchema(res.error)) res = await loadItems("institution_name, plaid_item_id, plaid_access_token")
  const { data, error } = res
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: accounts } = await supabaseAdmin.from("accounts").select("plaid_item_id, type").eq("user_id", TEST_USER_ID)

  const banks = await Promise.all(
    (data ?? []).map(async (b) => {
      const types = new Set(accounts?.filter((a) => a.plaid_item_id === b.plaid_item_id).map((a) => a.type))
      let consented: string[] = []
      let webhook: string | null = null
      try {
        const item = (await plaidClient.itemGet({ access_token: b.plaid_access_token })).data.item
        consented = [...(item.consented_products ?? []), ...(item.products ?? [])].map(String)
        webhook = item.webhook ?? null
      } catch {
        // ignore — shown as unknown
      }
      const missing: string[] = []
      if (types.has("investment") && !consented.includes("investments")) missing.push("investments")
      if (types.has("depository") && !consented.includes("auth")) missing.push("auth")
      if (types.has("credit") && !consented.includes("liabilities")) missing.push("liabilities")
      return {
        institution_name: b.institution_name,
        plaid_item_id: b.plaid_item_id,
        last_synced_at: b.last_synced_at ?? null,
        status: b.status ?? "ok",
        status_detail: b.status_detail ?? null,
        webhook,
        missing,
      }
    })
  )

  return NextResponse.json({ banks })
}
