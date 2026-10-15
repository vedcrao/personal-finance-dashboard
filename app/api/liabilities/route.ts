import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { CreditLiability } from "@/lib/types"

/** Credit card statement / payment details from Plaid Liabilities, keyed to our account ids. */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  const [{ data: items, error }, { data: accounts }] = await Promise.all([
    supabaseAdmin.from("plaid_items").select("plaid_access_token, institution_name").eq("user_id", userId),
    supabaseAdmin.from("accounts").select("id, plaid_account_id").eq("user_id", userId),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const accountMap = new Map(accounts?.map((a) => [a.plaid_account_id, a.id]) ?? [])
  const credit: CreditLiability[] = []

  await Promise.all(
    (items ?? []).map(async (item) => {
      try {
        const res = await plaidClient.liabilitiesGet({ access_token: item.plaid_access_token })
        for (const c of res.data.liabilities.credit ?? []) {
          const id = c.account_id ? accountMap.get(c.account_id) : undefined
          if (!id) continue
          credit.push({
            account_id: id,
            next_payment_due_date: c.next_payment_due_date ?? null,
            minimum_payment_amount: c.minimum_payment_amount ?? null,
            last_statement_balance: c.last_statement_balance ?? null,
            last_statement_issue_date: c.last_statement_issue_date ?? null,
            last_payment_amount: c.last_payment_amount ?? null,
            last_payment_date: c.last_payment_date ?? null,
            is_overdue: c.is_overdue ?? null,
            aprs: (c.aprs ?? []).map((a) => ({ apr_type: a.apr_type, apr_percentage: a.apr_percentage })),
          })
        }
      } catch {
        // Liabilities not enabled / supported for this item
      }
    })
  )

  return NextResponse.json({ credit })
}
