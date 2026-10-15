"use client"

import Link from "next/link"
import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState } from "@/components/ui/States"
import { categoryBreakdown, categoryStyle } from "@/lib/finance"
import type { Transaction } from "@/lib/types"

interface Props {
  transactions: Transaction[]
  title?: string
  limit?: number
  /** Link each category to the filtered transactions page */
  linkMonth?: string
  accountId?: string
  /** Replaces the default "All transactions" link (e.g. a "Back to week" chip) */
  action?: React.ReactNode
}

export function CategoryBreakdown({ transactions, title = "Breakdown by Category", limit = 6, linkMonth, accountId, action }: Props) {
  const cats = categoryBreakdown(transactions).slice(0, limit)

  return (
    <Panel
      title={title}
      icon="donut_large"
      iconClass="text-primary"
      className="h-full"
      action={action ?? <Link href="/transactions" className="text-xs font-semibold text-primary hover:underline">All transactions</Link>}
    >
      {cats.length === 0 ? (
        <EmptyState icon="donut_large" title="No spending in this period" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {cats.map((c) => {
            const s = categoryStyle(c.category)
            const params = new URLSearchParams({ category: c.category })
            if (linkMonth) params.set("month", linkMonth)
            if (accountId) params.set("account", accountId)
            return (
              <Link
                key={c.category}
                href={`/transactions?${params}`}
                className="flex flex-col gap-2 rounded-xl bg-surface-container-low/50 p-3 transition-colors hover:bg-surface-container-high/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.text}`}>
                      <Icon name={s.icon} size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.category}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {c.count} {c.count === 1 ? "transaction" : "transactions"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.bg} ${s.text}`}>{c.pct.toFixed(0)}%</span>
                    <Money value={c.amount} className="w-24 text-right text-sm font-semibold" />
                  </div>
                </div>
                <ProgressBar value={c.pct} fill={s.bar} height="xs" />
              </Link>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
