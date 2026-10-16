import type { Transaction } from "@/lib/types"

/** Build transactions tersely. amount uses Plaid's sign: +out (spent), −in (received). */
let n = 0
export function tx(p: Partial<Transaction> & { amount: number; date: string; description?: string }): Transaction {
  n++
  return {
    id: p.id ?? `t${n}`,
    account_id: p.account_id ?? "acct-checking",
    amount: p.amount,
    merchant_name: p.merchant_name ?? null,
    description: p.description ?? p.merchant_name ?? `txn ${n}`,
    date: p.date,
    category: p.category ?? null,
    is_anomaly: false,
    city: null,
    region: null,
    country: null,
    pending: p.pending ?? false,
    flow_override: p.flow_override ?? null,
    category_source: p.category_source ?? null,
    reimburses: p.reimburses ?? null,
  }
}

/** Row shape used by the matchers in lib/transfers.ts + lib/reimburse.ts */
export function row(t: Transaction, raw: Record<string, unknown> | null = null) {
  return { ...t, raw_data: raw }
}

export const pfc = (primary: string, detailed: string, confidence_level = "HIGH") => ({ personal_finance_category: { primary, detailed, confidence_level } })

export const round2 = (x: number) => Math.round(x * 100) / 100
