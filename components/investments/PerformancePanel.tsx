"use client"

import { useMemo, useState } from "react"
import { useApi } from "@/components/hooks/useApi"
import { useHidden } from "@/components/providers/FinanceProvider"
import { AreaChart } from "@/components/charts/LineChart"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Money } from "@/components/ui/Money"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { Skeleton } from "@/components/ui/States"
import { Icon } from "@/components/ui/Icon"
import { ymd } from "@/lib/finance"
import { money, MASK, shortDate } from "@/lib/format"
import type { BalanceSnapshot } from "@/lib/types"

type Range = "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL"

function sinceFor(r: Range): string | null {
  const now = new Date()
  const back = (days: number) => ymd(new Date(now.getTime() - days * 86400000))
  switch (r) {
    case "1W": return back(7)
    case "1M": return back(30)
    case "3M": return back(91)
    case "YTD": return `${now.getFullYear()}-01-01`
    case "1Y": return back(365)
    case "ALL": return null
  }
}

interface Props {
  value: number
  costBasis: number | null
  holdingsValueWithBasis: number
  accountId: string | null
}

export function PerformancePanel({ value, costBasis, holdingsValueWithBasis, accountId }: Props) {
  const hidden = useHidden()
  const [range, setRange] = useState<Range>("1M")
  const since = sinceFor(range)
  const params = new URLSearchParams({ type: "investment" })
  if (since) params.set("since", since)
  if (accountId) params.set("account", accountId)
  const { data, loading, setupRequired } = useApi<{ snapshots: BalanceSnapshot[] }>(`/api/snapshots?${params}`)

  const series = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of data?.snapshots ?? []) m.set(s.date, (m.get(s.date) ?? 0) + s.balance)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, value: v }))
  }, [data])

  const first = series[0]?.value
  const periodChange = series.length >= 2 && first !== undefined ? value - first : null
  const periodPct = periodChange !== null && first ? (periodChange / first) * 100 : null
  const low = series.length ? Math.min(...series.map((s) => s.value)) : null
  const high = series.length ? Math.max(...series.map((s) => s.value)) : null

  const totalGain = costBasis !== null ? holdingsValueWithBasis - costBasis : null
  const totalGainPct = totalGain !== null && costBasis ? (totalGain / costBasis) * 100 : null

  return (
    <Panel glow="tertiary" className="h-full" bodyClassName="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Live portfolio</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <Money value={value} splitCents className="text-[32px] leading-10 md:text-[40px] md:leading-[48px] font-bold tracking-[-0.03em]" />
            <span className="text-xs font-semibold uppercase text-on-surface-variant">USD</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {totalGain !== null && (
              <Badge tone={totalGain >= 0 ? "positive" : "negative"} icon={totalGain >= 0 ? "trending_up" : "trending_down"} className="!text-xs">
                {hidden ? MASK : money(totalGain, { sign: true })}
                {totalGainPct !== null && ` (${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(1)}%)`} all-time
              </Badge>
            )}
            {periodChange !== null && (
              <span className="text-xs text-on-surface-variant">
                <span className={`font-semibold ${periodChange >= 0 ? "text-tertiary" : "text-error"}`}>
                  {hidden ? MASK : money(periodChange, { sign: true })}
                  {periodPct !== null && ` (${periodPct >= 0 ? "+" : ""}${periodPct.toFixed(2)}%)`}
                </span>{" "}
                over {range === "ALL" ? "all time" : range}
              </span>
            )}
          </div>
        </div>
        <SegmentedControl<Range>
          ariaLabel="Timeframe"
          size="sm"
          value={range}
          onChange={setRange}
          options={(["1W", "1M", "3M", "YTD", "1Y", "ALL"] as Range[]).map((r) => ({ value: r, label: r }))}
        />
      </div>

      {low !== null && high !== null && series.length >= 2 && (
        <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant">
          <span className="flex items-center gap-1.5 rounded-md bg-surface-container-low px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-outline" /> Low: {hidden ? MASK : money(low)}
          </span>
          <span className="flex items-center gap-1.5 rounded-md bg-surface-container-low px-2 py-1 text-tertiary">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" /> High: {hidden ? MASK : money(high)}
          </span>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-[280px]" />
      ) : series.length >= 2 ? (
        <AreaChart data={series} formatValue={(v) => (hidden ? MASK : money(v))} formatDate={shortDate} />
      ) : (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center">
          <Icon name="show_chart" size={28} className="text-on-surface-variant" />
          <p className="text-sm font-semibold">Performance history is building</p>
          <p className="max-w-sm text-xs text-on-surface-variant">
            {setupRequired
              ? "Run supabase/migrations/20261014_web_features.sql to start recording daily balance snapshots."
              : "Plaid only reports today's balance, so a snapshot is saved each day you open the app. The chart appears after the second day."}
          </p>
        </div>
      )}
    </Panel>
  )
}
