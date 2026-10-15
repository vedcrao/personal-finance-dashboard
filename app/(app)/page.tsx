"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { NetWorthHero } from "@/components/overview/NetWorthHero"
import { QuickActions } from "@/components/overview/QuickActions"
import { WeeklySpending } from "@/components/overview/WeeklySpending"
import { CategoryBreakdown } from "@/components/overview/CategoryBreakdown"
import { UpcomingRecurring } from "@/components/overview/UpcomingRecurring"
import { TransactionItem } from "@/components/transactions/TransactionItem"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { EmptyState } from "@/components/ui/States"
import { addDays, spendDate, startOfWeek, ymd } from "@/lib/finance"

export default function OverviewPage() {
  const { transactions, accounts } = useFinance()
  const [weekOffset, setWeekOffset] = useState(0)
  // Tapped bar in Weekly Spending → category breakdown + transaction list switch to that day
  const [day, setDay] = useState<string | null>(null)
  const changeWeek = (o: number) => { setWeekOffset(o); setDay(null) }
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const weekTxns = useMemo(() => {
    const start = addDays(startOfWeek(new Date()), weekOffset * 7)
    const s = ymd(start)
    const e = ymd(addDays(start, 6))
    return transactions.filter((t) => spendDate(t) >= s && spendDate(t) <= e)
  }, [transactions, weekOffset])
  const dayTxns = useMemo(() => (day ? transactions.filter((t) => spendDate(t) === day) : []), [transactions, day])
  const dayLabel = day ? new Date(day + "T00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : ""
  const backToWeek = (
    <button type="button" onClick={() => setDay(null)}
      className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-secondary/20">
      <Icon name="close" size={14} /> Back to week
    </button>
  )

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 xl:col-span-8">
        <NetWorthHero />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <QuickActions />
      </div>

      <div className="col-span-12 xl:col-span-7">
        <WeeklySpending weekOffset={weekOffset} onWeekChange={changeWeek} selectedDay={day} onSelectDay={setDay} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        {day ? (
          <CategoryBreakdown transactions={dayTxns} title={`${dayLabel.split(",")[0]} by Category`} action={backToWeek} />
        ) : (
          <CategoryBreakdown transactions={weekTxns} title="This Week by Category" />
        )}
      </div>

      <div className="col-span-12 xl:col-span-7">
        {day ? (
          <Panel
            title={<div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{dayLabel}</h2><Badge>{dayTxns.length}</Badge></div>}
            icon="filter_alt"
            iconClass="text-secondary"
            padded={false}
            action={backToWeek}
          >
            {dayTxns.length === 0 ? (
              <EmptyState icon="event_busy" title="No transactions this day" />
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {dayTxns.map((t) => <TransactionItem key={t.id} t={t} account={accountById.get(t.account_id)} />)}
              </div>
            )}
          </Panel>
        ) : (
          <Panel
            title="Recent Activity"
            icon="history"
            iconClass="text-on-surface-variant"
            padded={false}
            action={<Link href="/spending" className="text-xs font-semibold text-primary hover:underline">View all</Link>}
          >
            <div className="divide-y divide-white/[0.04]">
              {transactions.slice(0, 8).map((t) => (
                <TransactionItem key={t.id} t={t} account={accountById.get(t.account_id)} />
              ))}
            </div>
          </Panel>
        )}
      </div>
      <div className="col-span-12 xl:col-span-5">
        <UpcomingRecurring />
      </div>
    </div>
  )
}
