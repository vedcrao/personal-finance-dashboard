"use client"

import { useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { CATEGORIES, isZelle, ruleKeyFor } from "@/lib/categories"
import { categoryStyle, flowOf, type Flow } from "@/lib/finance"
import { longDate } from "@/lib/format"
import type { FlowOverride, Transaction } from "@/lib/types"

const FLOW_OPTIONS: { value: Flow; label: string; hint: string; icon: string; cls: string }[] = [
  { value: "income", label: "Income", hint: "Money you earned or received", icon: "south_west", cls: "text-tertiary" },
  { value: "expense", label: "Expense", hint: "Counts toward your spending", icon: "north_east", cls: "text-rose-300" },
  { value: "reimbursement", label: "Reimbursement / refund", hint: "Money back from a person or store. Reduces spending", icon: "undo", cls: "text-secondary" },
  { value: "transfer", label: "Ignore", hint: "Moving your own money. Not counted", icon: "sync_alt", cls: "text-on-surface-variant" },
]

const SOURCE_LABEL: Record<string, string> = { plaid: "Plaid", llm: "AI", rule: "your rule", user: "you", transfer_match: "matching transfer between your accounts", refund_match: "matched refund (purchase + return cancel out)" }

/** Rendered once in the app layout; opened via useFinance().editTransaction(t). */
export function TransactionEditorHost() {
  const { editing, editTransaction } = useFinance()
  return editing ? <TransactionEditor key={editing.id} t={editing} onClose={() => editTransaction(null)} /> : null
}

function TransactionEditor({ t, onClose }: { t: Transaction; onClose: () => void }) {
  const { accounts, transactions, updateTransaction, refresh, notify } = useFinance()
  const builtIn = new Set<string>(CATEGORIES)
  const custom = [...new Set(transactions.map((x) => x.category).filter((c): c is string => !!c && !builtIn.has(c)))].sort()
  const [newCat, setNewCat] = useState("")
  const account = accounts.find((a) => a.id === t.account_id)

  const [category, setCategory] = useState<string | null>(t.category)
  // null = automatic
  const [flow, setFlow] = useState<FlowOverride | null>(t.flow_override)
  const [remember, setRemember] = useState(isZelle(t))
  const [saving, setSaving] = useState(false)

  const autoFlow = flowOf({ ...t, category, flow_override: null })
  const effective = flow ?? autoFlow
  const ruleKey = ruleKeyFor(t)
  const moneyIn = t.amount < 0

  async function save() {
    setSaving(true)
    try {
      const res = await sendJson<{ applied: number }>(`/api/transactions/${t.id}`, "PATCH", { category, flow_override: flow, remember })
      updateTransaction(t.id, { category, flow_override: flow, category_source: "user" })
      if (res.applied > 0) {
        notify(`Saved · applied to ${res.applied} similar ${res.applied === 1 ? "transaction" : "transactions"}`)
        await refresh()
      } else {
        notify("Saved")
      }
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit transaction"
      icon="edit_note"
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="mb-5 flex items-start justify-between gap-4 rounded-xl bg-surface-container-low p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{t.merchant_name ?? t.description}</p>
          {t.merchant_name && <p className="truncate text-xs text-on-surface-variant">{t.description}</p>}
          <p className="mt-1 text-xs text-on-surface-variant">
            {longDate(t.date)} · {account?.name ?? "Unknown account"}
            {account?.mask && ` •• ${account.mask}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.pending && <Badge tone="warning">Pending</Badge>}
            {t.category_source && <Badge>Categorized by {SOURCE_LABEL[t.category_source] ?? t.category_source}</Badge>}
          </div>
        </div>
        <Money value={-t.amount} sign className={`shrink-0 text-xl font-bold ${moneyIn ? "text-tertiary" : ""}`} />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Counts as</p>
        <button
          type="button"
          onClick={() => setFlow(null)}
          className={`text-xs font-semibold ${flow === null ? "text-secondary" : "text-on-surface-variant hover:text-on-surface"}`}
        >
          {flow === null ? `Automatic (${autoFlow})` : "Reset to automatic"}
        </button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {FLOW_OPTIONS.map((o) => {
          const active = effective === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setFlow(o.value)}
              aria-pressed={active}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                active ? "border-indigo-brand/50 bg-indigo-brand/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <Icon name={o.icon} size={18} className={`mt-0.5 ${o.cls}`} />
              <div>
                <p className="text-sm font-semibold">{o.label}</p>
                <p className="text-[11px] text-on-surface-variant">{o.hint}</p>
              </div>
            </button>
          )
        })}
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Category</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {[...CATEGORIES, ...custom].map((c) => {
          const s = categoryStyle(c)
          const active = category === c
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? `${s.bg} ${s.text} ring-1 ring-current` : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={s.icon} size={14} /> {c}
            </button>
          )
        })}
      </div>

      <div className="-mt-3 mb-5 flex items-center gap-2">
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { e.preventDefault(); setCategory(newCat.trim()); setNewCat("") } }}
          placeholder="+ New category (e.g. Gym)"
          maxLength={40}
          className="h-8 w-56 rounded-full border border-white/10 bg-surface-container-lowest px-3 text-xs outline-none placeholder:text-slate-500 focus:border-indigo-brand"
        />
        {newCat.trim() && <button type="button" onClick={() => { setCategory(newCat.trim()); setNewCat("") }} className="text-xs font-semibold text-secondary">Use</button>}
        {category && ![...CATEGORIES, ...custom].includes(category) && <Badge tone="primary">New: {category}</Badge>}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-container-low p-3">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-500" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Apply to all similar transactions</p>
          <p className="text-xs text-on-surface-variant">
            Past and future transactions matching <span className="font-mono text-on-surface">“{ruleKey}”</span> will use this category and setting.
          </p>
        </div>
      </label>
    </Modal>
  )
}
