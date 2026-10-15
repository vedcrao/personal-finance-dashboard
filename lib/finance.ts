import type { Account, Transaction } from "./types"
import { isP2P, P2P_CATEGORY, ruleKeyFor } from "./categories"

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Fallback only, for rows categorized before Plaid categories were used:
 * descriptions that usually mean money moving between your own accounts.
 */
export const TRANSFER_KEYWORDS = [
  "payment", "transfer", "autopay", "credit card", "ach pmt", "des:ach", "online pmt", "bill pay",
]

export type Flow = "income" | "expense" | "reimbursement" | "transfer"

/**
 * How a transaction counts. Precedence:
 *   1. your explicit choice (flow_override)
 *   2. payment apps (Venmo & Zelle): out = expense, in = paid back (reduces spending); category "Transfer" → transfer
 *   3. keyword fallback for transfers
 *   4. money back from a store (negative amount in a spending category) = refund → reduces spending
 *   5. sign: money in = income, money out = expense
 */
export function flowOf(t: Transaction): Flow {
  if (t.flow_override) return t.flow_override
  // Money in from a payment app (Zelle, Venmo, Splitwise…) = someone paying you back for something
  // you fronted. Only your own edits/rules can say otherwise (e.g. mark a person's Zelle as Income).
  const yours = t.category_source === "user" || t.category_source === "rule"
  if (t.amount < 0 && isP2P(t) && !yours) return "reimbursement"
  if (t.category === "Transfer") return "transfer"
  if (t.category === P2P_CATEGORY) return t.amount < 0 ? "reimbursement" : "expense"
  if (t.category !== "Income" && TRANSFER_KEYWORDS.some((k) => t.description.toLowerCase().includes(k))) return "transfer"
  if (t.amount < 0) return isRefundCategory(t.category) ? "reimbursement" : "income"
  return "expense"
}

/** Categories where money coming back means a refund/return, not income. */
const NOT_REFUND = new Set(["Income", P2P_CATEGORY, "Transfer", "Debt Payments", "Other", "Uncategorized"])
export function isRefundCategory(category: string | null): boolean {
  return !!category && !NOT_REFUND.has(category)
}

/** Short label for how a transaction counts (tables, lists). */
export function flowLabel(t: Transaction): string {
  if (isMatchedRefund(t)) return "Refunded"
  const f = flowOf(t)
  if (f === "reimbursement") {
    if (t.amount < 0 && isP2P(t)) return "Paid back"
    return t.amount < 0 && !t.flow_override && isRefundCategory(t.category) ? "Refund" : "Reimbursed"
  }
  return { income: "Income", expense: "Expense", transfer: "Ignored" }[f]
}

/** A purchase + its refund that were paired and cancel out (both show as "Refunded", count as $0). */
export function isMatchedRefund(t: Transaction): boolean {
  return t.category_source === "refund_match"
}

/**
 * The date a transaction counts toward spending: a repayment counts on the day of the purchase it
 * paid back (friends Venmo you in August for July's Airbnb → it reduces July). Lists still show t.date.
 */
export function spendDate(t: Transaction): string {
  return t.reimburses?.date ?? t.date
}

export function isTransfer(t: Transaction): boolean {
  return flowOf(t) === "transfer"
}

/** Counts toward spending (positive) or offsets it (reimbursement). */
export function isSpend(t: Transaction): boolean {
  const f = flowOf(t)
  return f === "expense" || f === "reimbursement"
}

export function isIncome(t: Transaction): boolean {
  return flowOf(t) === "income"
}

/**
 * Contribution to spending totals: expenses add, reimbursements (a friend paying you back)
 * subtract. Use this instead of t.amount anywhere spending is summed.
 */
export function spendAmount(t: Transaction): number {
  const f = flowOf(t)
  if (f === "expense") return Math.abs(t.amount)
  if (f === "reimbursement") return -Math.abs(t.amount)
  return 0
}

export function incomeAmount(t: Transaction): number {
  return flowOf(t) === "income" ? Math.abs(t.amount) : 0
}

/** Display-level direction (Accounts page filter chips). */
export type FlowType = "income" | "outflow" | "transfer"

export function flowType(t: Transaction): FlowType {
  const f = flowOf(t)
  if (f === "transfer") return "transfer"
  return t.amount < 0 ? "income" : "outflow"
}

export const FLOW_LABELS: Record<Flow, string> = {
  income: "Income",
  expense: "Expense",
  reimbursement: "Reimbursement",
  transfer: "Ignore (transfer)",
}

export function isInterest(t: Transaction): boolean {
  const d = `${t.description} ${t.merchant_name ?? ""}`.toLowerCase()
  return t.amount < 0 && (d.includes("interest") || d.includes("dividend"))
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface CategoryStyle {
  icon: string
  /** Tailwind classes */
  text: string
  bg: string
  bar: string
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  "Food & Dining": { icon: "restaurant", text: "text-amber-300", bg: "bg-amber-500/10", bar: "bg-amber-400" },
  Coffee: { icon: "local_cafe", text: "text-orange-200", bg: "bg-orange-700/20", bar: "bg-orange-300" },
  Groceries: { icon: "shopping_cart", text: "text-tertiary", bg: "bg-tertiary/10", bar: "bg-tertiary" },
  Shopping: { icon: "shopping_bag", text: "text-secondary", bg: "bg-secondary/10", bar: "bg-secondary" },
  Entertainment: { icon: "theaters", text: "text-fuchsia-300", bg: "bg-fuchsia-500/10", bar: "bg-fuchsia-400" },
  Travel: { icon: "flight_takeoff", text: "text-sky-300", bg: "bg-sky-500/10", bar: "bg-sky-400" },
  Transport: { icon: "local_taxi", text: "text-rose-300", bg: "bg-rose-500/10", bar: "bg-rose-400" },
  Subscriptions: { icon: "autorenew", text: "text-primary", bg: "bg-primary/10", bar: "bg-primary" },
  Healthcare: { icon: "health_and_safety", text: "text-emerald-300", bg: "bg-emerald-500/10", bar: "bg-emerald-400" },
  Utilities: { icon: "bolt", text: "text-yellow-300", bg: "bg-yellow-500/10", bar: "bg-yellow-400" },
  Rent: { icon: "apartment", text: "text-orange-300", bg: "bg-orange-500/10", bar: "bg-orange-400" },
  Income: { icon: "payments", text: "text-tertiary", bg: "bg-tertiary/10", bar: "bg-tertiary" },
  [P2P_CATEGORY]: { icon: "currency_exchange", text: "text-violet-300", bg: "bg-violet-500/15", bar: "bg-violet-400" },
  "Debt Payments": { icon: "account_balance", text: "text-red-300", bg: "bg-red-500/10", bar: "bg-red-400" },
  Transfer: { icon: "sync_alt", text: "text-secondary", bg: "bg-secondary/10", bar: "bg-secondary" },
  Other: { icon: "category", text: "text-on-surface-variant", bg: "bg-surface-container-highest", bar: "bg-outline" },
  Uncategorized: { icon: "help", text: "text-on-surface-variant", bg: "bg-surface-container-highest", bar: "bg-outline-variant" },
}

export function categoryStyle(category: string | null): CategoryStyle {
  return CATEGORY_STYLES[category ?? "Uncategorized"] ?? CATEGORY_STYLES.Other
}

export interface CategoryTotal {
  category: string
  amount: number
  count: number
  pct: number
}

export function categoryBreakdown(txns: Transaction[]): CategoryTotal[] {
  const spend = txns.filter(isSpend)
  const total = spend.reduce((s, t) => s + spendAmount(t), 0)
  const map = new Map<string, { amount: number; count: number }>()
  for (const t of spend) {
    const key = t.category ?? "Uncategorized"
    const cur = map.get(key) ?? { amount: 0, count: 0 }
    cur.amount += spendAmount(t)
    cur.count += 1
    map.set(key, cur)
  }
  return [...map.entries()]
    // Venmo & Zelle is a net number: shown even when more came in than went out (negative)
    .filter(([category, v]) => v.amount > 0.005 || (category === P2P_CATEGORY && Math.abs(v.amount) > 0.005))
    .map(([category, v]) => ({ category, ...v, pct: total > 0 ? Math.max(0, (v.amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export function sumSpend(txns: Transaction[]): number {
  return txns.reduce((s, t) => s + spendAmount(t), 0)
}

export function sumIncome(txns: Transaction[]): number {
  return txns.reduce((s, t) => s + incomeAmount(t), 0)
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  credit: "Credit Cards",
  depository: "Bank Accounts",
  investment: "Investments",
  loan: "Loans",
  other: "Other",
  closed: "Closed accounts",
}

export const ACCOUNT_TYPE_ORDER = ["depository", "credit", "investment", "loan", "other"]

export function isLiability(a: Account) {
  return a.type === "credit" || a.type === "loan"
}

export function netWorth(accounts: Account[]): number {
  return accounts.reduce((s, a) => {
    const bal = a.current_balance ?? 0
    return isLiability(a) ? s - bal : s + bal
  }, 0)
}

export function totalBalance(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0)
}

/** Balance to show for a cash account — available if present, else current. */
export function cashBalance(a: Account): number {
  return a.available_balance ?? a.current_balance ?? 0
}

export function utilization(balance: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null
  return (balance / limit) * 100
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (r.getDay() + 6) % 7 // Monday = 0
  r.setDate(r.getDate() - dow)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseYmd(dateStr).getTime() - today.getTime()) / 86400000)
}

export function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

export function currentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: ymd(start), end: ymd(end) }
}

export function getRecentMonths(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return { label: d.toLocaleDateString("en-US", { month: "long" }), value: ymd(d).slice(0, 7) }
  })
}

export function getBillingPeriods(day: number, count = 3) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const close = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), day)
    const open = new Date(close.getFullYear(), close.getMonth() - 1, day + 1)
    return {
      label: close.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: ymd(open),
      end: ymd(close),
    }
  })
}

/** The open (not yet closed) statement period for a card that closes on `day` each month. */
export function currentStatementPeriod(day: number, now = new Date()) {
  const clamp = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  let lastClose = clamp(now.getFullYear(), now.getMonth())
  if (ymd(lastClose) > ymd(now)) lastClose = clamp(now.getFullYear(), now.getMonth() - 1)
  return { start: ymd(addDays(lastClose, 1)), end: ymd(now) }
}

/* ------------------------------------------------------------------ */
/* Weekly spending                                                     */
/* ------------------------------------------------------------------ */

export interface DayBucket {
  date: string
  label: string // Mon
  short: string // M
  total: number
  txns: Transaction[]
}

export function weekBuckets(txns: Transaction[], weekStart: Date): DayBucket[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i)
    const date = ymd(d)
    const dayTxns = txns.filter((t) => spendDate(t) === date && isSpend(t))
    const label = d.toLocaleDateString("en-US", { weekday: "short" })
    return { date, label, short: label[0], total: dayTxns.reduce((s, t) => s + spendAmount(t), 0), txns: dayTxns }
  })
}

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export function formatLocation(t: Transaction): string | null {
  if (t.city && t.region) return `${t.city}, ${t.region}`
  if (t.city && t.country) return `${t.city}, ${t.country}`
  if (t.city) return t.city
  if (t.country && t.country !== "US") return t.country
  return null
}

/* ------------------------------------------------------------------ */
/* Recurring detection                                                 */
/* ------------------------------------------------------------------ */

export interface RecurringItem {
  merchant: string
  avgAmount: number
  frequency: "Weekly" | "Bi-weekly" | "Twice a month" | "Monthly" | "Quarterly"
  monthlyCost: number
  count: number
  lastDate: string
  category: string | null
  direction: "out" | "in"
}

const FREQS: { name: RecurringItem["frequency"]; days: number; tol: number; perMonth: number }[] = [
  { name: "Weekly", days: 7, tol: 2, perMonth: 4.33 },
  // Every other Friday: gaps are exactly 14 days
  { name: "Bi-weekly", days: 14, tol: 1, perMonth: 2.17 },
  // 15th + month-end paydays: gaps wobble between 13 and 17 days
  { name: "Twice a month", days: 15.2, tol: 3, perMonth: 2 },
  { name: "Monthly", days: 30.4, tol: 6, perMonth: 1 },
  { name: "Quarterly", days: 91, tol: 15, perMonth: 1 / 3 },
]
const MIN_OCCURRENCES = 3
const MIN_CONSECUTIVE_MONTHS = 3

/**
 * Stable "who is this" key: drops confirmation codes ("Conf# x1f5…") and bank ACH noise
 * ("IBM 3141 DES:PAYROLL INDN:… TRN*1*48155") so every charge from the same payee groups together.
 */
export function recurringKey(t: Pick<Transaction, "description" | "merchant_name">): string {
  return ruleKeyFor(t)
    .split(/\s(?:des|id|indn|co id|ppd|ccd|web|pmt info|trn|ref)[:*]/)[0]
    .split(" ")
    .filter((w) => !/\d{5,}|\*/.test(w))
    .join(" ")
    .trim()
}

const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1
const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)

/** Longest run of consecutive calendar months that contain at least one charge. */
function longestMonthRun(dates: string[]): number {
  const months = [...new Set(dates.map(monthIndex))].sort((x, y) => x - y)
  let best = 0
  let run = 0
  months.forEach((m, i) => { run = i > 0 && m === months[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run) })
  return best
}

/**
 * Real subscriptions / bills / paychecks only:
 *   - the SAME amount (±10%, or ±$1 for small charges) charged at least 3 times
 *   - across at least 3 consecutive months (quarterly: 3 charges in a row)
 *   - at a regular interval (weekly / bi-weekly / monthly / quarterly)
 *   - still active: the last one isn't overdue by more than one full interval
 * Two dinners at the same place, or a merchant you visit often for varying amounts, don't count.
 * direction "out" = bills / subscriptions, "in" = paychecks / recurring deposits.
 */
export function detectRecurring(txns: Transaction[], direction: "out" | "in" = "out", today = ymd(new Date())): RecurringItem[] {
  // Posted only: a pending charge and its posted copy would look like two charges
  const candidates = txns.filter((t) => !t.pending && (direction === "out" ? flowOf(t) === "expense" : isIncome(t)))
  const byMerchant = new Map<string, Transaction[]>()
  for (const t of candidates) {
    const key = recurringKey(t)
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), t])
  }

  const results: RecurringItem[] = []
  for (const group of byMerchant.values()) {
    if (group.length < MIN_OCCURRENCES) continue

    // Largest cluster of charges with (nearly) the same amount: one merchant can bill
    // a steady subscription alongside one-off purchases
    let cluster: Transaction[] = []
    for (const center of group) {
      const c = Math.abs(center.amount)
      const tol = Math.max(c * 0.1, 1)
      const members = group.filter((t) => Math.abs(Math.abs(t.amount) - c) <= tol)
      if (members.length > cluster.length) cluster = members
    }
    if (cluster.length < MIN_OCCURRENCES) continue
    const sorted = [...cluster].sort((a, b) => a.date.localeCompare(b.date))

    // Regular interval: most gaps match one known frequency
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date)).filter((g) => g > 0)
    if (gaps.length < MIN_OCCURRENCES - 1) continue
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    // First frequency whose interval fits ≥70% of the gaps
    const freq = FREQS.find((f) => Math.abs(median - f.days) <= f.tol && gaps.filter((g) => Math.abs(g - f.days) <= f.tol).length / gaps.length >= 0.7)
    if (!freq) continue

    // Long enough history
    const dates = sorted.map((t) => t.date)
    if (freq.name !== "Quarterly" && longestMonthRun(dates) < MIN_CONSECUTIVE_MONTHS) continue

    // Still active (not cancelled)
    const last = dates[dates.length - 1]
    if (daysBetween(last, today) > freq.days * 2 + freq.tol) continue

    const amounts = sorted.map((t) => Math.abs(t.amount))
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length
    results.push({
      merchant: sorted[0].merchant_name || sorted[sorted.length - 1].description.replace(/\s*conf(irmation)?\s*#.*$/i, "").trim(),
      avgAmount: avg,
      frequency: freq.name,
      monthlyCost: avg * freq.perMonth,
      count: sorted.length,
      lastDate: last,
      category: sorted[sorted.length - 1].category,
      direction,
    })
  }
  return results.sort((a, b) => b.monthlyCost - a.monthlyCost)
}

/* ------------------------------------------------------------------ */
/* Investments                                                         */
/* ------------------------------------------------------------------ */

export const SECURITY_TYPE_LABELS: Record<string, string> = {
  equity: "Stocks",
  etf: "ETFs",
  "mutual fund": "Mutual Funds",
  cryptocurrency: "Crypto",
  "fixed income": "Bonds",
  cash: "Cash",
  derivative: "Derivatives",
  other: "Other",
}

export const ALLOCATION_COLORS = ["bg-primary-container", "bg-secondary", "bg-tertiary", "bg-amber-400", "bg-rose-400", "bg-sky-400", "bg-outline"]

/* ------------------------------------------------------------------ */
/* Card networks                                                       */
/* ------------------------------------------------------------------ */

export type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | null

/**
 * Plaid doesn't report the card network, so infer it from the product name / issuer.
 * Returns null when unsure (no logo beats a wrong logo).
 */
export function cardNetwork(a: { name: string; institution_name: string }): CardNetwork {
  const s = `${a.name} ${a.institution_name}`.toLowerCase()
  if (/american express|\bamex\b/.test(s)) return "amex"
  if (/\bdiscover\b/.test(s)) return "discover"
  if (/\bvisa\b/.test(s)) return "visa"
  if (/mastercard|master card|world elite/.test(s)) return "mastercard"
  // Well-known products whose names don't include the network
  if (/autograph|active cash|reflect|sapphire|freedom|venture|quicksilver|savor/.test(s)) {
    return /venture|quicksilver|savor/.test(s) ? null : "visa"
  }
  return null
}

/** Clean bank-provided account names: drop mojibake (VISA��) and trailing "...1234". */
export function cleanAccountName(name: string): string {
  return name
    .replace(/[\uFFFD\u0080-\u009F]/g, "")
    .replace(/\s*\.{2,}\s*\d{2,}\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}
