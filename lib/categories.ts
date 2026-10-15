// Client-safe category helpers (no server SDK imports).

export const CATEGORIES = [
  "Food & Dining", "Groceries", "Shopping", "Entertainment", "Travel", "Transport", "Subscriptions",
  "Healthcare", "Utilities", "Rent", "Debt Payments", "Income", "Zelle", "Transfer", "Other",
] as const

export type Category = (typeof CATEGORIES)[number]

export function isZelle(t: { description: string; merchant_name: string | null }) {
  return /\bzelle\b/i.test(`${t.merchant_name ?? ""} ${t.description}`)
}

/** Stable text to match future transactions against (drops confirmation codes, memos, ids). */
export function ruleKeyFor(t: { description: string; merchant_name: string | null }): string {
  if (t.merchant_name && !isZelle(t)) return t.merchant_name.toLowerCase().replace(/[®™©]/g, "").trim()
  return t.description
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/\bconf(irmation)?\s*#.*$/i, "")
    .replace(/\bfor\s+".*$/i, "")
    .replace(/\b(id|ref|trace)[:#]?\s*\w+/gi, "")
    .replace(/[;,]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
