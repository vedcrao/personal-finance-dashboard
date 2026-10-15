"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { useApi } from "@/components/hooks/useApi"
import { Panel, SectionLabel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { Sparkline } from "@/components/charts/LineChart"
import { addDays, currentMonthRange, inRange, netWorth, sumIncome, sumSpend, totalBalance, ymd } from "@/lib/finance"
import { money } from "@/lib/format"
import type { BalanceSnapshot } from "@/lib/types"

const LIABILITY_TYPES = new Set(["credit", "loan"])

export function NetWorthHero() {
  const { accounts, transactions, hidden, toggleHidden } = useFinance()

  const [since] = useState(() => ymd(addDays(new Date(), -30)))
  const { data } = useApi<{ snapshots: BalanceSnapshot[] }>(`/api/snapshots?since=${since}`)

  const nw = netWorth(accounts)
  const cash = totalBalance(accounts.filter((a) => a.type === "depository"))
  const invested = totalBalance(accounts.filter((a) => a.type === "investment"))
  const debt = totalBalance(accounts.filter((a) => LIABILITY_TYPES.has(a.type)))

  // Net worth history from daily snapshots (fills in as the app is used)
  const series = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const s of data?.snapshots ?? []) {
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + (LIABILITY_TYPES.has(s.type) ? -s.balance : s.balance))
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
  }, [data])

  const { start, end } = currentMonthRange()
  const monthTxns = transactions.filter((t) => inRange(t.date, start, end))
  const cashFlow = sumIncome(monthTxns) - sumSpend(monthTxns)

  const hasHistory = series.length >= 2
  const change = hasHistory ? nw - series[0].value : cashFlow
  const changePct = hasHistory && series[0].value !== 0 ? (change / Math.abs(series[0].value)) * 100 : null

  return (
    <Panel glow="primary" className="h-full" bodyClassName="flex h-full flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <SectionLabel>Total net worth</SectionLabel>
            <button
              type="button"
              aria-label={hidden ? "Show balances" : "Hide balances"}
              onClick={toggleHidden}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high/60 text-on-surface-variant transition-all hover:text-on-surface active:scale-95"
            >
              <Icon name={hidden ? "visibility_off" : "visibility"} size={16} />
            </button>
          </div>
          <Money value={nw} splitCents className="mt-2 block text-[32px] leading-10 md:text-[40px] md:leading-[48px] font-bold tracking-[-0.03em]" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={change >= 0 ? "positive" : "negative"} icon={change >= 0 ? "trending_up" : "trending_down"} glow>
              {hidden ? "••••" : money(change, { sign: true })}
              {changePct !== null && !hidden && ` (${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%)`}
            </Badge>
            <span className="text-xs text-on-surface-variant">
              {hasHistory ? `since ${series[0].date.slice(5).replace("-", "/")}` : "net cash flow this month"}
            </span>
          </div>
        </div>
        <div className="hidden h-24 w-72 shrink-0 md:block">
          {hasHistory ? (
            <Sparkline points={series.map((s) => s.value)} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-xs text-on-surface-variant">
              Net worth history builds automatically — one snapshot per day.
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/5 pt-5 md:gap-3">
        {[
          { label: "Cash", value: cash, icon: "account_balance_wallet", cls: "bg-secondary/10 text-secondary" },
          { label: "Investments", value: invested, icon: "monitoring", cls: "bg-tertiary/10 text-tertiary" },
          { label: "Debt", value: -debt, icon: "credit_card", cls: "bg-error-container/30 text-error" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg md:flex ${s.cls}`}>
              <Icon name={s.icon} size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-on-surface-variant">{s.label}</p>
              <Money value={s.value} cents={false} className="block truncate text-sm font-semibold" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
