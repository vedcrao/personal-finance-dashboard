"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { CreditCardVisual, CARD_THEMES } from "@/components/cards/CreditCardVisual"
import { PaymentDue } from "@/components/cards/PaymentDue"
import { CardSettings } from "@/components/cards/CardSettings"
import { CategoryBreakdown } from "@/components/overview/CategoryBreakdown"
import { Panel, SectionLabel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState } from "@/components/ui/States"
import { currentMonthRange, currentStatementPeriod, inRange, sumSpend, utilization } from "@/lib/finance"
import { shortDate } from "@/lib/format"

export default function CardsPage() {
  const { accounts, liabilities, transactions } = useFinance()
  const cards = useMemo(() => accounts.filter((a) => a.type === "credit"), [accounts])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdx = Math.max(0, cards.findIndex((c) => c.id === selectedId))
  const card = cards[selectedIdx]

  if (!card) {
    return (
      <Panel>
        <EmptyState icon="credit_card" title="No credit cards linked">Connect a card issuer from the Connect page to track utilization and due dates.</EmptyState>
      </Panel>
    )
  }

  const totalUsed = cards.reduce((s, c) => s + (c.current_balance ?? 0), 0)
  const cardsWithLimit = cards.filter((c) => c.credit_limit !== null)
  const totalLimit = cardsWithLimit.reduce((s, c) => s + (c.credit_limit ?? 0), 0)
  const usedWithLimit = cardsWithLimit.reduce((s, c) => s + (c.current_balance ?? 0), 0)
  const overall = utilization(usedWithLimit, totalLimit)

  // Current statement period if we know the closing day, else calendar month
  const period = card.billing_cycle_day
    ? (() => {
        const p = currentStatementPeriod(card.billing_cycle_day)
        return { ...p, label: `Statement since ${shortDate(p.start)}` }
      })()
    : { ...currentMonthRange(), label: "This month" }

  const periodTxns = transactions.filter((t) => t.account_id === card.id && inRange(t.date, period.start, period.end))

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Aggregate line gauge */}
      <div className="col-span-12">
        <Panel glow="primary">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Credit &amp; Cards</h2>
              <Badge tone="primary">{cards.length} active</Badge>
            </div>
            <div className="flex gap-12">
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Total utilized</p>
                <Money value={totalUsed} splitCents className="mt-0.5 block text-2xl font-bold" />
              </div>
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Available pool</p>
                <Money value={Math.max(0, totalLimit - usedWithLimit)} splitCents className="mt-0.5 block text-2xl font-bold text-secondary" centsClassName="text-[0.6em] text-secondary/70" />
              </div>
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">Total limit</p>
                <Money value={totalLimit} cents={false} className="mt-0.5 block text-2xl font-bold" />
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-1.5">
            <ProgressBar
              value={overall ?? 0}
              className="p-0.5"
              fill={overall !== null && overall >= 30 ? "bg-gradient-to-r from-amber-400 to-error" : "bg-gradient-to-r from-secondary-container via-primary-container to-secondary"}
            />
            <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant">
              <span className={`flex items-center gap-1.5 ${overall !== null && overall < 30 ? "text-tertiary" : "text-amber-300"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {overall !== null ? `${overall.toFixed(1)}% overall utilization` : "Limits unavailable"}
              </span>
              <span>Aim to stay under 30%</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Card showcase */}
      <div className="col-span-12 xl:col-span-5">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <SectionLabel>Your cards</SectionLabel>
            <div className="flex gap-1">
              {cards.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Show ${c.name}`}
                  onClick={() => setSelectedId(c.id)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === selectedIdx ? `w-6 ${CARD_THEMES[i % CARD_THEMES.length].dot}` : "w-2 bg-surface-container-highest"}`}
                />
              ))}
            </div>
          </div>
          <CreditCardVisual account={card} themeIndex={selectedIdx} />
          <div className="grid grid-cols-2 gap-3">
            {cards.map((c, i) => {
              const u = utilization(c.current_balance ?? 0, c.credit_limit)
              const active = i === selectedIdx
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex flex-col rounded-xl p-3 text-left transition-all ${active ? "bg-surface-container-high ring-1 ring-white/10" : "bg-surface-container-low opacity-75 hover:opacity-100"}`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className={`truncate text-[11px] font-semibold ${CARD_THEMES[i % CARD_THEMES.length].accent}`}>{c.name}</span>
                    {u !== null && <span className={`text-[11px] font-semibold ${u < 30 ? "text-tertiary" : "text-error"}`}>{u.toFixed(1)}%</span>}
                  </div>
                  <Money value={c.current_balance ?? 0} className="mt-0.5 text-sm font-semibold" />
                  <span className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                    {c.credit_limit !== null ? <>Limit <Money value={c.credit_limit} cents={false} /></> : c.institution_name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
      <div className="col-span-12 xl:col-span-7">
        <PaymentDue account={card} liability={liabilities.find((l) => l.account_id === card.id)} />
      </div>

      {/* Statement breakdown + card details */}
      <div className="col-span-12 xl:col-span-7">
        <CategoryBreakdown transactions={periodTxns} title={`${period.label} · ${card.name}`} accountId={card.id} />
        <p className="mt-2 px-1 text-xs text-on-surface-variant">
          {periodTxns.length} transactions · <Money value={sumSpend(periodTxns)} /> spent this period
        </p>
      </div>
      <div className="col-span-12 xl:col-span-5">
        <CardSettings account={card} />
      </div>
    </div>
  )
}
