"use client"

import { useMemo, useState } from "react"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { categoryStyle, isSpend } from "@/lib/finance"
import { isP2P } from "@/lib/categories"
import { shortDate } from "@/lib/format"
import type { Transaction } from "@/lib/types"

const HOW: Record<string, string> = { memo: "auto-linked: memo names it", split: "auto-linked: exact split", ai: "auto-linked by AI from the memo", manual: "linked by you" }
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000
const nameOf = (t: Transaction) => (t.merchant_name ?? t.description).replace(/\s*conf(irmation)?\s*#.*$/i, "")

/**
 * For money you RECEIVED on Zelle/Venmo/…: choose the purchase it paid you back for.
 * value = selected purchase id, null = not linked (stays in the net Venmo & Zelle line).
 */
export function RepaymentLinker({ t, all, value, onChange }: { t: Transaction; all: Transaction[]; value: string | null; onChange: (id: string | null) => void }) {
  const [q, setQ] = useState("")
  const [showAll, setShowAll] = useState(false)
  const d = dayNum(t.date)

  // Purchases from a week after back to two months before, nearest first
  const candidates = useMemo(() => {
    const query = q.trim().toLowerCase()
    return all
      .filter((e) => e.amount > 0 && !isP2P(e) && isSpend(e) && e.category !== "Rent")
      .filter((e) => { const g = d - dayNum(e.date); return query ? g >= -30 && g <= 180 : g >= -7 && g <= 60 })
      .filter((e) => !query || `${nameOf(e)} ${e.category ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => Math.abs(d - dayNum(a.date)) - Math.abs(d - dayNum(b.date)))
  }, [all, d, q])

  const selected = value ? all.find((e) => e.id === value) : undefined
  const list = showAll || q ? candidates.slice(0, 40) : candidates.slice(0, 6)

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Paid back for…</p>
        {value && <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-on-surface-variant hover:text-on-surface">Unlink</button>}
      </div>

      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-secondary/40 bg-secondary/10 p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="link" size={18} className="shrink-0 text-secondary" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{nameOf(selected)}</p>
              <p className="text-[11px] text-on-surface-variant">
                {shortDate(selected.date)} · {selected.category} · {value === t.reimburses?.id && t.reimburses?.how ? HOW[t.reimburses.how] : "counts against this purchase"}
              </p>
            </div>
          </div>
          <Money value={selected.amount} className="shrink-0 text-sm font-semibold" />
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-on-surface-variant">
            Not linked: counts in the net <b>Venmo &amp; Zelle</b> line. Pick what they paid you back for to reduce that category instead.
          </p>
          <label className="relative mb-2 block">
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search purchases (e.g. Airbnb)"
              className="h-9 w-full rounded-full border border-white/10 bg-surface-container-lowest pr-3 pl-9 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand" />
          </label>
          {list.length === 0 ? (
            <p className="px-1 py-2 text-xs text-on-surface-variant">No purchases found around this date.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-xl bg-surface-container-low">
              {list.map((e) => {
                const s = categoryStyle(e.category)
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => onChange(e.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}><Icon name={s.icon} size={15} /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{nameOf(e)}</span>
                          <span className="block text-[11px] text-on-surface-variant">{shortDate(e.date)} · {e.category}</span>
                        </span>
                      </span>
                      <Money value={e.amount} className="shrink-0 text-sm" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {!q && candidates.length > 6 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-xs font-semibold text-primary hover:underline">
              {showAll ? "Show fewer" : `Show ${Math.min(candidates.length, 40) - 6} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** For a purchase: repayments linked to it (manual or automatic) and what you actually paid. */
export function PaidBackSummary({ t, all }: { t: Transaction; all: Transaction[] }) {
  const back = all.filter((r) => r.reimburses?.id === t.id)
  if (!back.length || t.amount <= 0) return null
  const total = back.reduce((s, r) => s + Math.abs(r.amount), 0)
  return (
    <div className="mb-5 rounded-xl bg-surface-container-low p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold"><Icon name="group" size={18} className="text-secondary" /> Paid back by {back.length}</span>
        <span className="text-xs text-on-surface-variant">Your share <Money value={t.amount - total} className="font-semibold text-on-surface" /></span>
      </div>
      <ul className="flex flex-col gap-1 text-xs text-on-surface-variant">
        {back.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span className="truncate">{nameOf(r).replace(/^zelle®?\s*payment\s*from\s*/i, "")} · {shortDate(r.date)}{r.category_source === "user" ? "" : " · auto"}</span>
            <Money value={Math.abs(r.amount)} className="shrink-0 text-tertiary" />
          </li>
        ))}
      </ul>
    </div>
  )
}
