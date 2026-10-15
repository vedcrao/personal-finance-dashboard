"use client"

import { useMemo } from "react"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { currentMonthRange, spendDate, detectRecurring, inRange, sumIncome, sumSpend } from "@/lib/finance"
import { shortDate } from "@/lib/format"
import type { Transaction } from "@/lib/types"

/**
 * Replaces the Stitch "Smart Automation Engine" (round-ups / paycheck split aren't
 * possible via Plaid read-only APIs) with insights computed from real transactions.
 */
export function CashFlowInsights({ transactions }: { transactions: Transaction[] }) {
  const { start, end } = currentMonthRange()
  const month = transactions.filter((t) => inRange(spendDate(t), start, end))
  const income = sumIncome(month)
  const spend = sumSpend(month)
  const savingsRate = income > 0 ? ((income - spend) / income) * 100 : null
  const paychecks = useMemo(() => detectRecurring(transactions, "in").slice(0, 2), [transactions])

  return (
    <Panel title="Cash Flow Insights" icon="insights" className="h-full" action={<Badge tone="secondary">This month</Badge>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-container-low p-3">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary/10 text-tertiary"><Icon name="south_west" size={18} /></div>
          <p className="text-xs text-on-surface-variant">Money in</p>
          <Money value={income} cents={false} className="block text-lg font-bold text-tertiary" />
        </div>
        <div className="rounded-xl bg-surface-container-low p-3">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300"><Icon name="north_east" size={18} /></div>
          <p className="text-xs text-on-surface-variant">Money out</p>
          <Money value={spend} cents={false} className="block text-lg font-bold" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-container-low p-3">
        <div className="flex items-center gap-2">
          <Icon name="savings" size={18} className="text-primary" />
          <span className="text-sm font-semibold">Savings rate</span>
        </div>
        {savingsRate === null ? (
          <span className="text-xs text-on-surface-variant">No income yet</span>
        ) : (
          <Badge tone={savingsRate >= 20 ? "positive" : savingsRate >= 0 ? "warning" : "negative"}>{savingsRate.toFixed(0)}%</Badge>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {paychecks.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No recurring deposits detected yet.</p>
        ) : (
          paychecks.map((p) => (
            <div key={p.merchant} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary" />
                </span>
                <span className="truncate">{p.merchant}</span>
              </span>
              <span className="shrink-0 text-xs text-on-surface-variant">
                {p.frequency} · <Money value={p.avgAmount} cents={false} className="font-semibold text-tertiary" /> · last {shortDate(p.lastDate)}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
