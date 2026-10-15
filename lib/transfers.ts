import { supabaseAdmin } from "./supabase-server"

/**
 * Internal transfer detection: money that leaves one of YOUR accounts and the same
 * amount arriving in another of YOUR accounts within a few days is a transfer, not
 * spending/income, whatever the bank or AI called it. Examples:
 *   SoFi Savings "To Checking - 4644"  $1,615  ↔  SoFi Checking "From Savings - 6796"
 *   BoA Checking "WF Credit Card AUTO PAY"     ↔  Wells Fargo card "AUTOMATIC PAYMENT"
 * Payments with people (Zelle/Venmo/Cash App/PayPal) are never paired: a $10 Venmo out
 * and a $10 Zelle in from a friend are two real transactions, not a transfer.
 */

const WINDOW_DAYS = 4
const P2P_TEXT = /\b(zelle|venmo|cash ?app|paypal|apple cash)\b/i
const P2P_PFC = new Set(["TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "TRANSFER_IN_TRANSFER_IN_FROM_APPS"])

interface Row {
  id: string
  account_id: string
  date: string
  amount: number
  description: string
  merchant_name: string | null
  category_source: string | null
  flow_override: string | null
  raw_data: { personal_finance_category?: { detailed?: string } | null } | null
}

const isP2P = (t: Row) =>
  P2P_TEXT.test(`${t.merchant_name ?? ""} ${t.description}`) || P2P_PFC.has(t.raw_data?.personal_finance_category?.detailed ?? "")

// You (or a rule you wrote) decided how these count; leave them alone
const locked = (t: Row) => t.category_source === "user" || t.category_source === "rule"

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000

export function findTransferPairs(rows: Row[]): [Row, Row][] {
  const candidates = rows.filter((t) => !isP2P(t) && !locked(t) && t.amount !== 0)
  const inflows = new Map<string, Row[]>()
  for (const t of candidates) {
    if (t.amount >= 0) continue
    const k = Math.abs(t.amount).toFixed(2)
    inflows.set(k, [...(inflows.get(k) ?? []), t])
  }
  const used = new Set<string>()
  const pairs: [Row, Row][] = []
  for (const out of candidates.filter((t) => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date))) {
    const match = (inflows.get(out.amount.toFixed(2)) ?? [])
      .filter((i) => !used.has(i.id) && i.account_id !== out.account_id && Math.abs(dayNum(i.date) - dayNum(out.date)) <= WINDOW_DAYS)
      .sort((a, b) => Math.abs(dayNum(a.date) - dayNum(out.date)) - Math.abs(dayNum(b.date) - dayNum(out.date)))[0]
    if (!match) continue
    used.add(match.id)
    pairs.push([out, match])
  }
  return pairs
}

/** Marks matched pairs as Transfer / ignored. Returns how many transactions changed. */
export async function markInternalTransfers(userId: string): Promise<number> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, account_id, date, amount, description, merchant_name, category_source, flow_override, raw_data")
      .eq("user_id", userId)
      .order("date")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const ids = findTransferPairs(rows)
    .flat()
    .filter((t) => !(t.category_source === "transfer_match" && t.flow_override === "transfer"))
    .map((t) => t.id)

  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabaseAdmin
      .from("transactions")
      .update({ category: "Transfer", flow_override: "transfer", category_source: "transfer_match" })
      .eq("user_id", userId)
      .in("id", ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
  }
  return ids.length
}
