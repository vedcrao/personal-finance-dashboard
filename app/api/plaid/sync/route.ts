import { NextResponse } from "next/server"
import { plaidClient } from "@/lib/plaid"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export async function POST() {
  try {
    // Get all connected banks for this user
    const { data: plaidItems, error: itemsError } = await supabaseAdmin
      .from("plaid_items")
      .select("plaid_access_token, plaid_item_id, institution_name")
      .eq("user_id", TEST_USER_ID)

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    if (!plaidItems?.length) return NextResponse.json({ error: "No banks connected" }, { status: 400 })

    const today = new Date()
    const startDate = "2026-04-01"
    const endDate = today.toISOString().split("T")[0]

    // Look up all accounts
    const { data: accounts } = await supabaseAdmin
      .from("accounts")
      .select("id, plaid_account_id")
      .eq("user_id", TEST_USER_ID)

    const accountMap = new Map(accounts?.map((a) => [a.plaid_account_id, a.id]) ?? [])
let totalSynced = 0
    let billingDaysUpdated = 0

    // Sync transactions from each connected bank
    for (const item of plaidItems) {
      const transactionsResponse = await plaidClient.transactionsGet({
        access_token: item.plaid_access_token,
        start_date: startDate,
        end_date: endDate,
      })

      const rows = transactionsResponse.data.transactions
        .filter((t) => accountMap.has(t.account_id))
        .map((t) => ({
          user_id: TEST_USER_ID,
          account_id: accountMap.get(t.account_id),
          plaid_transaction_id: t.transaction_id,
          amount: t.amount,
          merchant_name: t.merchant_name ?? null,
          description: t.name,
          date: t.date,
          city: t.location?.city ?? null,
          region: t.location?.region ?? null,
          country: t.location?.country ?? null,
          raw_data: t,
        }))

      if (rows.length) {
        const { error } = await supabaseAdmin
          .from("transactions")
          .upsert(rows, { onConflict: "plaid_transaction_id" })

        if (error) console.error(`Sync error for ${item.institution_name}:`, error.message)
        else totalSynced += rows.length
      }

      // Auto-detect billing cycle day from Plaid Liabilities for credit card accounts
      try {
        const liabilitiesResponse = await plaidClient.liabilitiesGet({
          access_token: item.plaid_access_token,
        })
        const creditCards = liabilitiesResponse.data.liabilities.credit ?? []
        for (const card of creditCards) {
          if (!card.last_statement_issue_date) continue
          const accountDbId = accountMap.get(card.account_id)
          if (!accountDbId) continue
          const statementDay = new Date(card.last_statement_issue_date).getUTCDate()
          await supabaseAdmin
            .from("accounts")
            .update({ billing_cycle_day: statementDay })
            .eq("id", accountDbId)
          billingDaysUpdated++
        }
      } catch (liabErr: any) {
        // Liabilities not available for this item — skip silently
        console.log(`Liabilities not available for ${item.institution_name}:`, liabErr?.response?.data?.error_code ?? liabErr?.message)
      }
    }

    return NextResponse.json({ synced: totalSynced, banks: plaidItems.length, billing_days_updated: billingDaysUpdated })
  } catch (err: any) {
    console.error("Sync error:", err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
