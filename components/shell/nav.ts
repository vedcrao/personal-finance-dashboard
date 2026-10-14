export interface NavItem {
  href: string
  label: string
  icon: string
  title: string
  subtitle: string
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: "dashboard", title: "Overview", subtitle: "Net worth, spending velocity and recent activity" },
  { href: "/accounts", label: "Accounts", icon: "account_balance", title: "Checking & Savings", subtitle: "Cash, savings goals and money movement" },
  { href: "/cards", label: "Cards", icon: "credit_card", title: "Credit & Cards", subtitle: "Utilization, statements and payments due" },
  { href: "/investments", label: "Invest", icon: "monitoring", title: "Investment Portfolio", subtitle: "Performance, allocation and holdings" },
  { href: "/transactions", label: "Transactions", icon: "receipt_long", title: "Transactions", subtitle: "Every transaction, filterable by period, category and place" },
]

export const SECONDARY_NAV: NavItem[] = [
  { href: "/connect", label: "Connect banks", icon: "link", title: "Connect & Sync", subtitle: "Link institutions with Plaid and keep data fresh" },
]

export function navFor(pathname: string): NavItem {
  const all = [...NAV, ...SECONDARY_NAV]
  return all.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) ?? NAV[0]
}
