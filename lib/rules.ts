// Client-safe rule types + matching (shared by categorizer, editor, assistant, rules page).
import { CATEGORIES } from "./categories"

export type FlowChoice = "income" | "expense" | "reimbursement" | "transfer"
export type Direction = "in" | "out"

export interface CategorizationRule {
  id?: string
  name?: string | null
  /** Case-insensitive text that must appear in "merchant_name description" */
  match: string
  min_amount?: number | null
  max_amount?: number | null
  direction?: Direction | null
  category: string | null
  flow_override: FlowChoice | null
  source?: string
  created_at?: string
}

interface Matchable {
  description: string
  merchant_name: string | null
  /** Plaid sign: positive = money out */
  amount: number
}

/** Lowercase, drop ®/™/©, collapse whitespace — banks write "Zelle®" and "Zelle" interchangeably. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim()
}

export function ruleMatches(rule: CategorizationRule, t: Matchable): boolean {
  const text = normalizeText(`${t.merchant_name ?? ""} ${t.description}`)
  if (!text.includes(normalizeText(rule.match))) return false
  const abs = Math.abs(t.amount)
  if (rule.min_amount != null && abs < Number(rule.min_amount)) return false
  if (rule.max_amount != null && abs > Number(rule.max_amount)) return false
  if (rule.direction === "out" && t.amount <= 0) return false
  if (rule.direction === "in" && t.amount >= 0) return false
  return true
}

/** Most specific rule wins: amount-bounded rules beat open ones, then longer match text. */
export function specificity(r: CategorizationRule): number {
  return (r.min_amount != null ? 1000 : 0) + (r.max_amount != null ? 1000 : 0) + (r.direction ? 500 : 0) + r.match.length
}

export function findRule<T extends CategorizationRule>(rules: T[], t: Matchable): T | undefined {
  return [...rules].sort((a, b) => specificity(b) - specificity(a)).find((r) => ruleMatches(r, t))
}

export function describeRule(r: CategorizationRule): string {
  const parts = [`contains “${r.match}”`]
  if (r.direction) parts.push(r.direction === "out" ? "money out" : "money in")
  if (r.min_amount != null && r.max_amount != null) parts.push(`$${r.min_amount}–$${r.max_amount}`)
  else if (r.min_amount != null) parts.push(`$${r.min_amount}+`)
  else if (r.max_amount != null) parts.push(`up to $${r.max_amount}`)
  const then = [r.category && `→ ${r.category}`, r.flow_override && `counts as ${r.flow_override === "transfer" ? "ignored" : r.flow_override}`].filter(Boolean)
  return `${parts.join(" · ")} ${then.join(", ")}`.trim()
}

/** Custom categories are allowed; keep them tidy. */
export function normalizeCategory(c: unknown): string | null {
  if (typeof c !== "string") return null
  const s = c.trim().replace(/\s+/g, " ")
  if (!s || s.length > 40) return null
  const builtIn = CATEGORIES.find((b) => b.toLowerCase() === s.toLowerCase())
  return builtIn ?? s.replace(/\b\w/g, (ch) => ch.toUpperCase())
}
