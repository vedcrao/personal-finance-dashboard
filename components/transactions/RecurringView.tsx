"use client"

import { useMemo } from "react"
import { Panel } from "@/components/ui/Panel"
import { Badge, type Tone } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { EmptyState } from "@/components/ui/States"
import { categoryStyle, detectRecurring, type RecurringItem } from "@/lib/finance"
import { shortDate } from "@/lib/format"
import type { Transaction } from "@/lib/types"

const FREQ_TONE: Record<RecurringItem["frequency"], Tone> = { Weekly: "warning", "Bi-weekly": "warning", Monthly: "primary", Quarterly: "secondary" }

function RecurringTable({ items, empty }: { items: RecurringItem[]; empty: string }) {
  if (!items.length) return <EmptyState icon="event_repeat" title={empty}>Sync more months of data to improve detection.</EmptyState>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          <th className="px-6 py-3 text-left">Merchant</th>
          <th className="px-4 py-3 text-left">Category</th>
          <th className="px-4 py-3 text-left">Frequency</th>
          <th className="px-4 py-3 text-right">Occurrences</th>
          <th className="px-4 py-3 text-left">Last</th>
          <th className="px-4 py-3 text-right">Typical</th>
          <th className="px-6 py-3 text-right">Per month</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.04]">
        {items.map((r) => {
          const s = categoryStyle(r.direction === "in" ? "Income" : r.category)
          return (
            <tr key={r.merchant} className="transition-colors hover:bg-surface-container-high/40">
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}><Icon name={s.icon} size={18} /></div>
                  <span className="max-w-[260px] truncate font-semibold">{r.merchant}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-on-surface-variant">{r.category ?? "—"}</td>
              <td className="px-4 py-3"><Badge tone={FREQ_TONE[r.frequency]}>{r.frequency}</Badge></td>
              <td className="px-4 py-3 text-right tabular text-on-surface-variant">{r.count}</td>
              <td className="px-4 py-3 text-on-surface-variant">{shortDate(r.lastDate)}</td>
              <td className="px-4 py-3 text-right"><Money value={r.avgAmount} /></td>
              <td className={`px-6 py-3 text-right font-semibold ${r.direction === "in" ? "text-tertiary" : ""}`}><Money value={r.monthlyCost} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function RecurringView({ transactions }: { transactions: Transaction[] }) {
  const out = useMemo(() => detectRecurring(transactions, "out"), [transactions])
  const inc = useMemo(() => detectRecurring(transactions, "in"), [transactions])
  const monthly = out.reduce((s, r) => s + r.monthlyCost, 0)
  const monthlyIn = inc.reduce((s, r) => s + r.monthlyCost, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Est. monthly cost", node: <Money value={monthly} />, icon: "autorenew", cls: "bg-primary/10 text-primary" },
          { label: "Recurring charges", node: <span>{out.length}</span>, icon: "event_repeat", cls: "bg-secondary/10 text-secondary" },
          { label: "Annual estimate", node: <Money value={monthly * 12} cents={false} />, icon: "calendar_month", cls: "bg-amber-500/10 text-amber-300" },
          { label: "Recurring income / mo", node: <Money value={monthlyIn} />, icon: "payments", cls: "bg-tertiary/10 text-tertiary" },
        ].map((c) => (
          <div key={c.label} className="glass flex items-center gap-3 rounded-2xl p-5">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.cls}`}><Icon name={c.icon} size={20} /></div>
            <div>
              <p className="text-xs text-on-surface-variant">{c.label}</p>
              <p className="text-xl font-bold tracking-tight">{c.node}</p>
            </div>
          </div>
        ))}
      </div>

      <Panel title="Subscriptions & Bills" icon="autorenew" iconClass="text-primary" padded={false}
        action={<span className="text-xs text-on-surface-variant">Consistent amount across multiple months</span>}>
        <div className="overflow-x-auto"><RecurringTable items={out} empty="No recurring charges detected yet" /></div>
      </Panel>

      <Panel title="Recurring Income" icon="payments" iconClass="text-tertiary" padded={false}>
        <div className="overflow-x-auto"><RecurringTable items={inc} empty="No recurring deposits detected yet" /></div>
      </Panel>
    </div>
  )
}
