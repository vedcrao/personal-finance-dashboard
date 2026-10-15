import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { ymd, addDays } from "@/lib/finance"
import type { InvestmentActivity } from "@/lib/types"

/** Buys, sells, dividends, contributions from Plaid Investments (read live, up to 24 months back). */
export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  const days = Math.min(730, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 90)))
  const start = ymd(addDays(new Date(), -days))
  const end = ymd(new Date())

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabaseAdmin.from("plaid_items").select("plaid_access_token, plaid_item_id, institution_name").eq("user_id", userId),
    supabaseAdmin.from("accounts").select("id, plaid_account_id, plaid_item_id, type").eq("user_id", userId),
  ])
  const accMap = new Map(accounts?.map((a) => [a.plaid_account_id, a.id]) ?? [])
  const investItems = new Set(accounts?.filter((a) => a.type === "investment").map((a) => a.plaid_item_id))

  const activity: InvestmentActivity[] = []
  const errors: string[] = []

  await Promise.all(
    (items ?? []).filter((i) => investItems.has(i.plaid_item_id)).map(async (item) => {
      try {
        let offset = 0
        for (;;) {
          const r = await plaidClient.investmentsTransactionsGet({
            access_token: item.plaid_access_token, start_date: start, end_date: end, options: { count: 500, offset },
          })
          const secs = new Map(r.data.securities.map((s) => [s.security_id, s]))
          for (const t of r.data.investment_transactions) {
            const id = accMap.get(t.account_id)
            if (!id) continue
            const sec = t.security_id ? secs.get(t.security_id) : undefined
            activity.push({
              id: t.investment_transaction_id, account_id: id, date: t.date, name: t.name,
              type: t.type, subtype: t.subtype, quantity: t.quantity, price: t.price, amount: t.amount, fees: t.fees ?? null,
              ticker: sec?.ticker_symbol ?? null, security_name: sec?.name ?? null,
            })
          }
          offset += r.data.investment_transactions.length
          if (offset >= r.data.total_investment_transactions || !r.data.investment_transactions.length) break
        }
      } catch (e) {
        const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
        errors.push(`${item.institution_name}: ${code ?? "failed"}`)
      }
    })
  )

  activity.sort((a, b) => b.date.localeCompare(a.date))
  return NextResponse.json({ activity, errors })
}
