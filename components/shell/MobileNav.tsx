"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Icon } from "@/components/ui/Icon"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Notifications } from "./Notifications"
import { NAV, SECONDARY_NAV, navFor } from "./nav"

const TABS = ["/", "/spending", "/accounts", "/cards", "/investments"]

/** Phone header (Stitch mobile design): brand / page title, privacy, alerts, sync. */
export function MobileHeader() {
  const pathname = usePathname()
  const { hidden, toggleHidden, syncAndCategorize, syncing } = useFinance()
  const nav = navFor(pathname)
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-brand to-secondary-container">
            <Icon name="change_history" size={18} filled className="text-white" />
          </div>
          <span className="truncate text-base font-semibold tracking-tight">{pathname === "/" ? "Vertice" : nav.title}</span>
        </div>
        <div className="flex items-center">
          <button type="button" onClick={toggleHidden} aria-label={hidden ? "Show balances" : "Hide balances"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container">
            <Icon name={hidden ? "visibility_off" : "visibility"} size={22} />
          </button>
          <Notifications />
          <button type="button" onClick={syncAndCategorize} disabled={!!syncing} aria-label="Sync"
            className="flex h-10 w-10 items-center justify-center rounded-full text-secondary active:bg-surface-container disabled:opacity-60">
            <Icon name={syncing ? "progress_activity" : "sync"} size={22} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {syncing && <p className="px-4 pb-2 text-[11px] text-secondary">{syncing}</p>}
    </header>
  )
}

/** Bottom tab bar: 4 main tabs + "More" sheet for the rest. */
export function MobileTabBar() {
  const pathname = usePathname()
  const { me, signOut } = useFinance()
  const [more, setMore] = useState(false)
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const tabs = NAV.filter((n) => TABS.includes(n.href))
  const extra = [...NAV.filter((n) => !TABS.includes(n.href)), ...SECONDARY_NAV]
  const moreActive = extra.some((n) => isActive(n.href))

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 animate-fade-in bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMore(false)}>
          <div
            className="glass-raised absolute inset-x-0 bottom-0 animate-pop-in rounded-t-3xl px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            {extra.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMore(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3.5 text-sm font-semibold ${isActive(n.href) ? "bg-secondary/10 text-secondary" : "text-on-surface active:bg-white/5"}`}>
                <Icon name={n.icon} size={22} />
                <span className="flex-1">{n.label}</span>
                <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
              </Link>
            ))}
            {me && (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/5 px-3 pt-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">@{me.username ?? me.email.split("@")[0]}</p>
                  <p className="truncate text-xs text-on-surface-variant">{me.email}</p>
                </div>
                <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-2 text-xs font-semibold">
                  <Icon name="logout" size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/5 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-stretch justify-around px-1">
          {tabs.map((n) => {
            const active = isActive(n.href)
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} onClick={() => setMore(false)}
                className={`flex min-w-[44px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? "text-secondary" : "text-on-surface-variant"}`}>
                <Icon name={n.icon} size={24} filled={active} />
                {n.label}
              </Link>
            )
          })}
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
            className={`flex min-w-[44px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${more || moreActive ? "text-secondary" : "text-on-surface-variant"}`}>
            <Icon name={more ? "close" : "menu"} size={24} />
            More
          </button>
        </div>
      </nav>
    </>
  )
}
