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
import { addDays, startOfWeek, ymd } from "@/lib/finance"

export default function OverviewPage() {
  const { transactions, accounts } = useFinance()
  const [weekOffset, setWeekOffset] = useState(0)
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const weekTxns = useMemo(() => {
    const start = addDays(startOfWeek(new Date()), weekOffset * 7)
    const s = ymd(start)
    const e = ymd(addDays(start, 6))
    return transactions.filter((t) => t.date >= s && t.date <= e)
  }, [transactions, weekOffset])

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 xl:col-span-8">
        <NetWorthHero />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <QuickActions />
      </div>

      <div className="col-span-12 xl:col-span-7">
        <WeeklySpending weekOffset={weekOffset} onWeekChange={setWeekOffset} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <CategoryBreakdown transactions={weekTxns} title="This Week by Category" />
      </div>

      <div className="col-span-12 xl:col-span-7">
        <Panel
          title="Recent Activity"
          icon="history"
          iconClass="text-on-surface-variant"
          padded={false}
          action={<Link href="/transactions" className="text-xs font-semibold text-primary hover:underline">View all</Link>}
        >
          <div className="divide-y divide-white/[0.04]">
            {transactions.slice(0, 8).map((t) => (
              <TransactionItem key={t.id} t={t} account={accountById.get(t.account_id)} />
            ))}
          </div>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-5">
        <UpcomingRecurring />
      </div>
    </div>
  )
}
