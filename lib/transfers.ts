import { supabaseAdmin } from "./supabase-server"
import { isP2P as isP2PShared } from "./categories"
import { matchRepayments, type Row as RepaymentRow } from "./reimburse"

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

interface Row {
  id: string
  category?: string | null
  account_id: string
  date: string
  amount: number
  description: string
  merchant_name: string | null
  category_source: string | null
  flow_override: string | null
  raw_data: { personal_finance_category?: { detailed?: string } | null } | null
}

const isP2P = (t: Row) => isP2PShared(t)

// You (or a rule you wrote) decided how these count; leave them alone
const locked = (t: Row) => t.category_source === "user" || t.category_source === "rule"

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000

export function findTransferPairs(rows: Row[]): [Row, Row][] {
  const candidates = rows.filter((t) => !isP2P(t) && !locked(t) && t.category_source !== "refund_match" && t.amount !== 0)
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

/**
 * Purchase + refund pairs: same account, same merchant, same amount, refund within
 * 90 days after the purchase (pending or posted). Both are marked "Refunded" and count as
 * $0, so a bought-then-returned item never shows as spending (or the refund as income).
 * Refunds with no matching purchase still count as negative spending via flowOf().
 */
const REFUND_WINDOW_DAYS = 90
const merchantKey = (t: Row) => (t.merchant_name ?? t.description).toLowerCase().replace(/[^a-z0-9]/g, "")

export function findRefundPairs(rows: Row[]): [Row, Row][] {
  const free = rows.filter((t) => !locked(t) && !isP2P(t) && t.category_source !== "transfer_match")
  const purchases = free.filter((t) => t.amount > 0).sort((a, b) => a.date.localeCompare(b.date))
  const used = new Set<string>()
  const pairs: [Row, Row][] = []
  for (const refund of free.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date))) {
    const key = merchantKey(refund)
    const amt = Math.abs(refund.amount).toFixed(2)
    // Latest matching purchase on or before the refund date
    const match = purchases
      .filter((p) => !used.has(p.id) && p.account_id === refund.account_id && p.amount.toFixed(2) === amt && merchantKey(p) === key)
      .filter((p) => { const d = dayNum(refund.date) - dayNum(p.date); return d >= 0 && d <= REFUND_WINDOW_DAYS })
      .pop()
    if (!match) continue
    used.add(match.id)
    pairs.push([match, refund])
  }
  return pairs
}

/**
 * Money moving from an account of yours that has no transactions here (e.g. a matured CD):
 * the description names one of your own account masks ("…MATUR BAL ID:XXXXXX7959").
 */
export function findOwnAccountTransfers(rows: Row[], masks: string[]): string[] {
  const own = masks.filter((m) => /^\d{4}$/.test(m))
  return rows
    .filter((t) => !locked(t) && !isP2P(t) && t.category_source !== "transfer_match" && t.category_source !== "refund_match")
    .filter((t) => /\b(transfer|xfer|matur|from|to|deposit|withdraw)/i.test(t.description))
    .filter((t) => own.some((m) => new RegExp(`(?:x|-|#|\\*|\\s)${m}\\b`, "i").test(t.description)))
    .map((t) => t.id)
}

/** Marks matched transfer pairs (ignored) and purchase/refund pairs (refunded). Returns how many changed. */
export async function markInternalTransfers(userId: string): Promise<number> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, account_id, date, amount, description, merchant_name, category, category_source, flow_override, raw_data")
      .eq("user_id", userId)
      .order("date")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const transferIds = findTransferPairs(rows)
    .flat()
    .filter((t) => !(t.category_source === "transfer_match" && t.flow_override === "transfer"))
    .map((t) => t.id)
  const refundIds = findRefundPairs(rows)
    .flat()
    .filter((t) => !(t.category_source === "refund_match" && t.flow_override === "transfer"))
    .map((t) => t.id)

  const apply = async (ids: string[], update: Record<string, string>) => {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabaseAdmin.from("transactions").update(update).eq("user_id", userId).in("id", ids.slice(i, i + 100))
      if (error) throw new Error(error.message)
    }
  }
  await apply(transferIds, { category: "Transfer", flow_override: "transfer", category_source: "transfer_match" })
  // Keep the category (e.g. Shopping) so it's still findable; just don't count it
  await apply(refundIds, { flow_override: "transfer", category_source: "refund_match" })

  const { data: accts } = await supabaseAdmin.from("accounts").select("mask").eq("user_id", userId)
  const ownIds = findOwnAccountTransfers(rows.filter((t) => !transferIds.includes(t.id)), (accts ?? []).map((a) => a.mask).filter(Boolean))
  await apply(ownIds, { category: "Transfer", flow_override: "transfer", category_source: "transfer_match" })

  // Repayments: linked to a purchase only when confident; otherwise stay in the net Venmo & Zelle line
  const linked = await matchRepayments(userId, rows.filter((t) => !ownIds.includes(t.id) && !transferIds.includes(t.id)) as RepaymentRow[])

  return transferIds.length + refundIds.length + ownIds.length + linked
}
