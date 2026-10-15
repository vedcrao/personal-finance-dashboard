"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { EmptyState } from "@/components/ui/States"
import { addDays, categoryStyle, detectRecurring, parseYmd, ymd } from "@/lib/finance"
import { relativeDay, shortDate } from "@/lib/format"

const INTERVAL_DAYS = { Weekly: 7, "Bi-weekly": 14, "Twice a month": 15, Monthly: 30, Quarterly: 91 }

/** Recurring charges with their next expected date, soonest first. */
export function UpcomingRecurring() {
  const { transactions } = useFinance()

  const upcoming = useMemo(() => {
    const today = ymd(new Date())
    return detectRecurring(transactions)
      .map((r) => {
        let next = addDays(parseYmd(r.lastDate), INTERVAL_DAYS[r.frequency])
        while (ymd(next) < today) next = addDays(next, INTERVAL_DAYS[r.frequency])
        return { ...r, next: ymd(next) }
      })
      .sort((a, b) => a.next.localeCompare(b.next))
      .slice(0, 5)
  }, [transactions])

  const monthly = detectRecurring(transactions).reduce((s, r) => s + r.monthlyCost, 0)

  return (
    <Panel
      title="Upcoming Bills"
      icon="event_repeat"
      iconClass="text-tertiary"
      className="h-full"
      padded={false}
      action={
        <Link href="/spending?tab=recurring" className="text-xs font-semibold text-primary hover:underline">
          View all
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <EmptyState icon="event_repeat" title="No recurring charges yet">Bills show up after 3 months of the same charge on a regular schedule.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.04]">
            {upcoming.map((r) => {
              const s = categoryStyle(r.category)
              return (
                <li key={r.merchant} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}>
                      <Icon name={s.icon} size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.merchant}</p>
                      <p className="text-[11px] text-on-surface-variant">{r.frequency} · last {shortDate(r.lastDate)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Money value={r.avgAmount} className="text-sm font-semibold" />
                    <Badge tone="neutral" className="!px-2 !py-0 text-[10px]">{relativeDay(r.next) === "Today" ? "Today" : shortDate(r.next)}</Badge>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-white/5 px-6 py-3 text-xs text-on-surface-variant">
            <span>Est. monthly recurring</span>
            <Money value={monthly} className="font-semibold text-on-surface" />
          </div>
        </>
      )}
    </Panel>
  )
}
