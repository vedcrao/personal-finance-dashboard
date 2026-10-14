import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { plaidClient } from "@/lib/plaid"
import { TEST_USER_ID } from "@/lib/user"

/**
 * Routing + account numbers for a depository account via Plaid Auth.
 * Only fetched on demand (never cached client-side, never stored in our DB).
 * Requires the Item to have consented to `auth` — new links request it via
 * additional_consented_products; older Items need to be re-linked.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: account, error } = await supabaseAdmin
    .from("accounts")
    .select("plaid_account_id, plaid_item_id, type")
    .eq("id", id)
    .eq("user_id", TEST_USER_ID)
    .single()

  if (error || !account) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  if (account.type !== "depository") {
    return NextResponse.json({ error: "Account numbers are only available for bank accounts" }, { status: 400 })
  }

  const { data: item } = await supabaseAdmin
    .from("plaid_items")
    .select("plaid_access_token")
    .eq("plaid_item_id", account.plaid_item_id)
    .eq("user_id", TEST_USER_ID)
    .single()

  if (!item) return NextResponse.json({ error: "Bank connection not found" }, { status: 404 })

  try {
    const res = await plaidClient.authGet({
      access_token: item.plaid_access_token,
      options: { account_ids: [account.plaid_account_id] },
    })
    const ach = res.data.numbers.ach.find((n) => n.account_id === account.plaid_account_id)
    if (!ach) return NextResponse.json({ error: "No ACH numbers returned for this account" }, { status: 404 })

    return NextResponse.json(
      { routing: ach.routing, account: ach.account, wire_routing: ach.wire_routing ?? null },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err: unknown) {
    const plaidErr = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data
    const code = plaidErr?.error_code
    const needsRelink = code === "ADDITIONAL_CONSENT_REQUIRED" || code === "PRODUCTS_NOT_SUPPORTED" || code === "INVALID_PRODUCT"
    return NextResponse.json(
      {
        error: needsRelink
          ? "This bank connection wasn't authorized for account numbers. Reconnect the bank from the Connect page to enable it."
          : plaidErr?.error_message ?? "Failed to fetch account numbers",
        code,
      },
      { status: needsRelink ? 409 : 500 }
    )
  }
}
