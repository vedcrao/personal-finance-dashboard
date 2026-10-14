const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })

export function money(n: number, opts: { cents?: boolean; sign?: boolean; compact?: boolean } = {}): string {
  const { cents = true, sign = false, compact = false } = opts
  const f = compact ? usdCompact : cents ? usd : usd0
  const s = f.format(Math.abs(n))
  if (sign) return `${n < 0 ? "−" : "+"}${s}`
  return n < 0 ? `−${s}` : s
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function shortDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function longDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

export function relativeDay(s: string): string {
  const [y, m, d] = s.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff > 1 && diff < 7) return date.toLocaleDateString("en-US", { weekday: "short" })
  return shortDate(s)
}

export const MASK = "••••••"
