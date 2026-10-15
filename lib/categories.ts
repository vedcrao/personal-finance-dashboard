// Client-safe category helpers (no server SDK imports).

export const CATEGORIES = [
  "Food & Dining", "Coffee", "Groceries", "Shopping", "Entertainment", "Travel", "Transport", "Subscriptions",
  "Healthcare", "Utilities", "Rent", "Debt Payments", "Income", "Venmo & Zelle", "Transfer", "Other",
] as const

export type Category = (typeof CATEGORIES)[number]

/**
 * Every Zelle / Venmo / Splitwise / Cash App / PayPal payment lands here (unless one of your rules
 * says otherwise, e.g. Zelle to your landlord → Rent). Out adds, in subtracts: one net number.
 */
export const P2P_CATEGORY = "Venmo & Zelle"

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

/** Person-to-person payment apps: money in from these is usually someone paying you back. */
export const P2P_TEXT = /\b(zelle|venmo|cash ?app|paypal|apple cash|splitwise)\b/i
const P2P_PFC = new Set(["TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "TRANSFER_IN_TRANSFER_IN_FROM_APPS"])

export function isP2P(t: { description: string; merchant_name: string | null; raw_data?: unknown }): boolean {
  const pfc = (t.raw_data as { personal_finance_category?: { detailed?: string } } | null | undefined)?.personal_finance_category?.detailed
  return P2P_TEXT.test(`${t.merchant_name ?? ""} ${t.description}`) || P2P_PFC.has(pfc ?? "")
}
