"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@/components/ui/Icon"
import { useFinance } from "@/components/providers/FinanceProvider"
import { addDays, daysUntil, utilization, ymd } from "@/lib/finance"
import { money, shortDate } from "@/lib/format"

interface Alert {
  id: string
  icon: string
  tone: "error" | "warning" | "info"
  title: string
  detail: string
  href: string
}

/** Alerts derived from real data: payments due, high utilization, flagged anomalies. */
function useAlerts(): Alert[] {
  const { accounts, liabilities, transactions } = useFinance()
  return useMemo(() => {
    const out: Alert[] = []
    const byId = new Map(accounts.map((a) => [a.id, a]))

    for (const l of liabilities) {
      const acct = byId.get(l.account_id)
      if (!acct || !l.next_payment_due_date) continue
      const days = daysUntil(l.next_payment_due_date)
      if (l.is_overdue) {
        out.push({ id: `od-${l.account_id}`, icon: "error", tone: "error", title: `${acct.name} payment overdue`, detail: `Minimum ${money(l.minimum_payment_amount ?? 0)}`, href: "/cards" })
      } else if (days >= 0 && days <= 7) {
        out.push({ id: `due-${l.account_id}`, icon: "event_upcoming", tone: "warning", title: `${acct.name} due in ${days} ${days === 1 ? "day" : "days"}`, detail: `Statement ${money(l.last_statement_balance ?? 0)} · due ${shortDate(l.next_payment_due_date)}`, href: "/cards" })
      }
    }

    for (const a of accounts) {
      if (a.type !== "credit") continue
      const u = utilization(a.current_balance ?? 0, a.credit_limit)
      if (u !== null && u >= 30) {
        out.push({ id: `util-${a.id}`, icon: "speed", tone: u >= 50 ? "error" : "warning", title: `${a.name} at ${u.toFixed(0)}% utilization`, detail: "Keeping it under 30% helps your credit score", href: "/cards" })
      }
    }

    const monthAgo = ymd(addDays(new Date(), -30))
    for (const t of transactions.filter((t) => t.is_anomaly && t.date >= monthAgo).slice(0, 5)) {
      out.push({ id: `an-${t.id}`, icon: "gpp_maybe", tone: "info", title: `Unusual: ${t.merchant_name ?? t.description}`, detail: `${money(t.amount)} on ${shortDate(t.date)}`, href: "/spending" })
    }
    return out
  }, [accounts, liabilities, transactions])
}

export function Notifications() {
  const alerts = useAlerts()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <Icon name="notifications" size={22} />
        {alerts.length > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-secondary ring-2 ring-surface" />}
      </button>

      {open && (
        <div className="glass-raised fixed right-3 left-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 animate-pop-in rounded-2xl p-2 md:absolute md:left-auto md:right-0 md:top-12 md:w-96">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Alerts</p>
          {alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-on-surface-variant">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]">
                    <Icon
                      name={a.icon}
                      size={20}
                      className={`mt-0.5 ${a.tone === "error" ? "text-error" : a.tone === "warning" ? "text-amber-300" : "text-secondary"}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-on-surface-variant">{a.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
