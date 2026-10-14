"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { useFinance } from "@/components/providers/FinanceProvider"
import { netWorth } from "@/lib/finance"
import { NAV, SECONDARY_NAV, type NavItem } from "./nav"

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors max-lg:justify-center ${
        active ? "bg-secondary/10 text-secondary" : "text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-secondary glow-secondary" />}
      <Icon name={item.icon} size={22} filled={active} />
      <span className="max-lg:hidden">{item.label}</span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { accounts, sendDigest, sendingDigest } = useFinance()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const institutions = new Set(accounts.map((a) => a.institution_name)).size

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-surface/80 backdrop-blur-xl max-lg:w-20">
      <div className="flex h-16 items-center gap-2.5 px-5 max-lg:justify-center max-lg:px-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-brand to-secondary-container glow-primary">
          <Icon name="change_history" size={20} filled className="text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight max-lg:hidden">Vertice</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} />)}
        <div className="my-3 h-px bg-white/5" />
        {SECONDARY_NAV.map((item) => <NavLink key={item.href} item={item} active={isActive(item.href)} />)}
      </nav>

      <div className="m-3 rounded-2xl border border-white/5 bg-surface-container-low/70 p-4 max-lg:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Net worth</p>
        <Money value={netWorth(accounts)} cents={false} className="mt-1 block text-xl font-bold tracking-tight" />
        <p className="mt-1 text-xs text-on-surface-variant">
          {accounts.length} accounts · {institutions} {institutions === 1 ? "institution" : "institutions"}
        </p>
        <button
          type="button"
          onClick={sendDigest}
          disabled={sendingDigest}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-container-high py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
        >
          <Icon name={sendingDigest ? "progress_activity" : "sms"} size={16} className={sendingDigest ? "animate-spin" : ""} />
          {sendingDigest ? "Sending…" : "Text me a weekly digest"}
        </button>
      </div>
    </aside>
  )
}
