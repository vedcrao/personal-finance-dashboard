"use client"

import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { flowOf, FLOW_LABELS, type Flow } from "@/lib/finance"
import type { Transaction } from "@/lib/types"
import { P2P_CATEGORY } from "@/lib/categories"
import { money } from "@/lib/format"

const hiddenNet = (n: number) => money(n, { sign: true })

/** "Zelle payment to Jay Vanam Conf# …" → "Jay Vanam" */
export function zelleCounterparty(t: Transaction): string {
  const m = t.description.match(/(?:zelle|venmo)\s*®?\s*(?:payment|transfer)?\s*(?:to|from)\s+(.+?)(?:\s+for\s+"|\s+conf\s*#|;|$)/i)
  const name = (m?.[1] ?? t.merchant_name ?? t.description).trim()
  return name.replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

const FLOW_STYLE: Record<Flow, string> = {
  income: "bg-tertiary/10 text-tertiary",
  expense: "bg-rose-500/10 text-rose-300",
  reimbursement: "bg-secondary/10 text-secondary",
  transfer: "bg-surface-container-highest text-on-surface-variant",
}

export function ZelleSummary({ transactions }: { transactions: Transaction[] }) {
  const zelle = transactions.filter((t) => t.category === P2P_CATEGORY)
  if (!zelle.length) return null

  const sent = zelle.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const received = zelle.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)

  const byFlow = new Map<Flow, number>()
  for (const t of zelle) byFlow.set(flowOf(t), (byFlow.get(flowOf(t)) ?? 0) + Math.abs(t.amount))

  const people = new Map<string, { sent: number; received: number; count: number }>()
  for (const t of zelle) {
    const p = zelleCounterparty(t)
    const cur = people.get(p) ?? { sent: 0, received: 0, count: 0 }
    if (t.amount > 0) cur.sent += t.amount
    else cur.received -= t.amount
    cur.count++
    people.set(p, cur)
  }
  const top = [...people.entries()].sort((a, b) => b[1].sent + b[1].received - (a[1].sent + a[1].received)).slice(0, 8)

  return (
    <Panel title="Venmo & Zelle" icon="currency_exchange" iconClass="text-violet-300"
      action={<span className="text-xs text-on-surface-variant">Net {hiddenNet(sent - received)} added to spending</span>}>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-container-low p-3">
              <p className="flex items-center gap-1 text-xs text-on-surface-variant"><Icon name="north_east" size={14} /> Sent</p>
              <Money value={sent} className="text-lg font-bold" />
            </div>
            <div className="rounded-xl bg-surface-container-low p-3">
              <p className="flex items-center gap-1 text-xs text-on-surface-variant"><Icon name="south_west" size={14} /> Received</p>
              <Money value={received} className="text-lg font-bold text-tertiary" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Currently counted as</p>
            {(["income", "expense", "reimbursement", "transfer"] as Flow[]).map((f) => (
              <div key={f} className="flex items-center justify-between text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLOW_STYLE[f]}`}>{FLOW_LABELS[f]}</span>
                <Money value={byFlow.get(f) ?? 0} className="font-semibold" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">By person (this period)</p>
          <ul className="divide-y divide-white/[0.04]">
            {top.map(([name, v]) => {
              const net = v.received - v.sent
              return (
                <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-on-surface-variant">
                    <span>{v.count}×</span>
                    <span>out <Money value={v.sent} cents={false} /></span>
                    <span>in <Money value={v.received} cents={false} /></span>
                    <Money value={net} sign cents={false} className={`w-16 text-right font-semibold ${net >= 0 ? "text-tertiary" : "text-rose-300"}`} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Panel>
  )
}
