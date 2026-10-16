"use client"

import { useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { Notice } from "@/components/ui/States"
import { categoryStyle, type CategoryTotal } from "@/lib/finance"
import { money } from "@/lib/format"
import type { CategoryBudget } from "@/lib/budgets"

interface Props {
  cats: CategoryTotal[]
  budgets: CategoryBudget[]
  setupRequired: boolean
  /** True when viewing a calendar month (budgets are monthly) */
  monthly: boolean
  selected: string | null
  onSelect: (category: string | null) => void
  onBudgetsChange: (budgets: CategoryBudget[]) => void
}

function barTone(pct: number, fallback: string) {
  if (pct > 100) return "bg-error"
  if (pct >= 80) return "bg-amber-400"
  return fallback
}

/** Category list with an optional monthly budget per category (inline edit, like goals). */
export function CategoryBudgets({ cats, budgets, setupRequired, monthly, selected, onSelect, onBudgetsChange }: Props) {
  const { notify, hidden } = useFinance()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const byCat = new Map(budgets.map((b) => [b.category, b.monthly_amount]))

  // Spending categories + budgeted categories with nothing spent yet
  const rows: CategoryTotal[] = [
    ...cats,
    ...budgets.filter((b) => !cats.some((c) => c.category === b.category)).map((b) => ({ category: b.category, amount: 0, count: 0, pct: 0 })),
  ]

  const budgeted = rows.filter((r) => byCat.has(r.category))
  const totalBudget = budgeted.reduce((s, r) => s + (byCat.get(r.category) ?? 0), 0)
  const totalSpent = budgeted.reduce((s, r) => s + Math.max(0, r.amount), 0)
  const over = budgeted.filter((r) => r.amount > (byCat.get(r.category) ?? Infinity)).length

  async function save(category: string) {
    const amount = draft.trim() === "" ? null : Number(draft)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return notify("Enter a valid amount", "error")
    setSaving(true)
    try {
      const res = await fetch("/api/budgets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, monthly_amount: amount }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Couldn't save budget")
      const next = budgets.filter((b) => b.category !== category)
      if (data.budget) next.push(data.budget)
      onBudgetsChange(next.sort((a, b) => a.category.localeCompare(b.category)))
      setEditing(null)
      notify(data.budget ? `${category} budget: ${money(data.budget.monthly_amount, { cents: false })}/month` : `${category} budget removed`)
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save budget", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {setupRequired && <Notice tone="warning">Budgets need one database update: run <code className="break-all text-xs">supabase/migrations/20261018_category_budgets.sql</code>.</Notice>}
      {budgeted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3 py-2 text-xs">
          <span className="font-semibold">
            Budgets: <Money value={totalSpent} cents={false} /> <span className="font-normal text-on-surface-variant">of</span> <Money value={totalBudget} cents={false} />
          </span>
          <span className={over ? "font-semibold text-error" : "text-tertiary"}>{over ? `${over} over budget` : "All on track"}</span>
        </div>
      )}
      {!monthly && budgeted.length > 0 && <p className="text-[11px] text-on-surface-variant">Budgets are monthly; this statement period may not line up with a calendar month.</p>}

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 lg:grid-cols-2">
        {rows.map((c) => {
          const s = categoryStyle(c.category)
          const sel = selected === c.category
          const budget = byCat.get(c.category)
          const pct = budget ? (Math.max(0, c.amount) / budget) * 100 : c.pct
          const left = budget !== undefined ? budget - c.amount : 0
          const isEditing = editing === c.category

          return (
            <div key={c.category} className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${sel ? "bg-surface-container-high ring-1 ring-indigo-brand/40" : "hover:bg-surface-container-high/50"}`}>
              <button type="button" onClick={() => onSelect(sel ? null : c.category)} aria-label={`Filter to ${c.category}`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.text}`}>
                <Icon name={s.icon} size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button type="button" onClick={() => onSelect(sel ? null : c.category)} className="truncate text-left font-semibold">{c.category}</button>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Money value={c.amount} className="font-semibold" />
                    {budget !== undefined && <span className="text-on-surface-variant">/ <Money value={budget} cents={false} /></span>}
                    {!setupRequired && (
                      <button type="button" onClick={() => { setEditing(isEditing ? null : c.category); setDraft(budget?.toString() ?? "") }}
                        aria-label={budget ? `Edit ${c.category} budget` : `Set ${c.category} budget`} title={budget ? "Edit budget" : "Set a monthly budget"}
                        className={`rounded p-0.5 text-on-surface-variant hover:text-on-surface ${budget ? "" : "opacity-60 md:opacity-0 md:group-hover:opacity-100"}`}>
                        <Icon name={budget ? "edit" : "flag"} size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                  <div className={`h-full rounded-full transition-all ${budget ? barTone(pct, s.bar) : s.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                {budget !== undefined && !isEditing && (
                  <p className={`mt-1 text-[10px] ${left < 0 ? "font-semibold text-error" : pct >= 80 ? "text-amber-300" : "text-on-surface-variant"}`}>
                    {hidden ? "••" : left < 0 ? `${money(-left, { cents: false })} over` : `${money(left, { cents: false })} left`} · {pct.toFixed(0)}%
                  </p>
                )}
                {isEditing && (
                  <form onSubmit={(e) => { e.preventDefault(); void save(c.category) }} className="mt-2 flex items-center gap-1.5">
                    <span className="text-[11px] text-on-surface-variant">Monthly budget $</span>
                    <input autoFocus type="number" inputMode="decimal" min={0} step="any" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. 300"
                      className="h-7 w-24 rounded-md border border-white/10 bg-surface-container-lowest px-2 text-xs tabular outline-none focus:border-indigo-brand" />
                    <button type="submit" disabled={saving} className="text-xs font-semibold text-secondary">Save</button>
                    {budget !== undefined && <button type="button" onClick={() => { setDraft(""); void save(c.category) }} className="text-xs text-error">Remove</button>}
                    <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="text-on-surface-variant"><Icon name="close" size={14} /></button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
