import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
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

async function loadItems(userId: string, columns: string) {
  return supabaseAdmin
    .from("plaid_items")
    .select(columns)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<ItemRow[]>()
}

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  let res = await loadItems(userId, "institution_name, plaid_item_id, plaid_access_token, last_synced_at, status, status_detail")
  // Automation migration not run yet
  if (isMissingSchema(res.error)) res = await loadItems(userId, "institution_name, plaid_item_id, plaid_access_token")
  const { data, error } = res
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: accounts } = await supabaseAdmin.from("accounts").select("plaid_item_id, type").eq("user_id", userId)

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
