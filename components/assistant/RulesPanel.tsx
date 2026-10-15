"use client"

import { useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { EmptyState, Notice, Skeleton } from "@/components/ui/States"
import { CATEGORIES } from "@/lib/categories"
import { describeRule, type CategorizationRule } from "@/lib/rules"

export type RuleRow = CategorizationRule & { id: string; matches: number }

const INPUT =
  "h-9 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"

const SOURCE: Record<string, string> = { assistant: "AI", editor: "Editor", manual: "Manual" }

const EMPTY: CategorizationRule = { match: "", min_amount: null, max_amount: null, direction: null, category: null, flow_override: null, name: null }

function RuleForm({ initial, onCancel, onSaved, categories }: {
  initial: CategorizationRule & { id?: string }
  onCancel: () => void
  onSaved: () => void
  categories: string[]
}) {
  const { notify, refresh } = useFinance()
  const [r, setR] = useState(initial)
  const [preview, setPreview] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<CategorizationRule>) => { setR((x) => ({ ...x, ...patch })); setPreview(null) }

  async function doPreview() {
    try {
      const res = await sendJson<{ matches: number }>("/api/rules", "POST", { ...r, flow_override: r.flow_override ?? "expense", preview: true })
      setPreview(res.matches)
    } catch (e) { notify(e instanceof Error ? e.message : "Preview failed", "error") }
  }

  const [overlap, setOverlap] = useState<string | null>(null)
  async function save(allowOverlap = false) {
    setSaving(true)
    try {
      const res = await sendJson<{ applied: number }>("/api/rules", initial.id ? "PATCH" : "POST", { ...r, id: initial.id, allow_overlap: allowOverlap })
      notify(`Rule saved · ${res.applied} transactions updated`)
      onSaved()
      void refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed"
      if (msg.startsWith("Overlaps with")) setOverlap(msg)
      else notify(msg, "error")
    }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
      <input className={INPUT} placeholder="Name (optional), e.g. Gym" value={r.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
      <input className={INPUT} placeholder="Description contains… e.g. zelle payment to rohan" value={r.match} onChange={(e) => set({ match: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <input className={INPUT} type="number" min={0} placeholder="Min $" value={r.min_amount ?? ""} onChange={(e) => set({ min_amount: e.target.value === "" ? null : Number(e.target.value) })} />
        <input className={INPUT} type="number" min={0} placeholder="Max $" value={r.max_amount ?? ""} onChange={(e) => set({ max_amount: e.target.value === "" ? null : Number(e.target.value) })} />
        <select className={INPUT} value={r.direction ?? ""} onChange={(e) => set({ direction: (e.target.value || null) as CategorizationRule["direction"] })} aria-label="Direction">
          <option value="">In or out</option>
          <option value="out">Money out</option>
          <option value="in">Money in</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={INPUT} list="rule-categories" placeholder="Category (or type a new one)" value={r.category ?? ""} onChange={(e) => set({ category: e.target.value || null })} />
        <datalist id="rule-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <select className={INPUT} value={r.flow_override ?? ""} onChange={(e) => set({ flow_override: (e.target.value || null) as CategorizationRule["flow_override"] })} aria-label="Counts as">
          <option value="">Counts as: automatic</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="reimbursement">Reimbursement</option>
          <option value="transfer">Ignore (transfer)</option>
        </select>
      </div>
      {overlap && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <span>{overlap}</span>
          <button type="button" onClick={() => { setOverlap(null); void save(true) }} className="shrink-0 font-semibold underline">Save anyway</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={doPreview} disabled={r.match.trim().length < 3} className="text-xs font-semibold text-secondary hover:underline disabled:opacity-40">
          {preview === null ? "Preview matches" : `Matches ${preview} transaction${preview === 1 ? "" : "s"}`}
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="primary" loading={saving} onClick={() => save()} disabled={r.match.trim().length < 3}>Save rule</Button>
        </div>
      </div>
    </div>
  )
}

export function RulesPanel({ rules, loading, error, reload }: { rules: RuleRow[]; loading: boolean; error: string | null; reload: () => void }) {
  const { notify, refresh, transactions } = useFinance()
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const categories = [...new Set([...CATEGORIES, ...transactions.map((t) => t.category).filter((c): c is string => !!c)])].sort()

  async function remove(r: RuleRow) {
    if (!confirm(`Delete rule "${r.name ?? r.match}"? Transactions it categorized will be re-categorized automatically.`)) return
    try {
      await sendJson(`/api/rules?id=${r.id}`, "DELETE")
      notify("Rule deleted")
      reload()
      void refresh()
    } catch (e) { notify(e instanceof Error ? e.message : "Delete failed", "error") }
  }

  return (
    <Panel title={<div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Your Rules</h2><Badge>{rules.length}</Badge></div>}
      icon="rule" iconClass="text-tertiary" padded={false} className="h-full"
      action={editing !== "new" && <Button size="sm" icon="add" onClick={() => setEditing("new")}>New rule</Button>}>
      <div className="flex flex-col gap-2 p-4">
        {error && <Notice tone="warning">{error}</Notice>}
        {editing === "new" && (
          <RuleForm initial={EMPTY} categories={categories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
        )}
        {loading ? (
          <><Skeleton className="h-14" /><Skeleton className="h-14" /></>
        ) : rules.length === 0 && editing !== "new" ? (
          <EmptyState icon="rule" title="No rules yet">Ask the assistant, tick “Apply to all similar” when editing a transaction, or add one here.</EmptyState>
        ) : (
          rules.map((r) =>
            editing === r.id ? (
              <RuleForm key={r.id} initial={r} categories={categories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
            ) : (
              <div key={r.id} className="group flex items-start justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{r.name ?? r.category ?? r.match}</span>
                    {r.source && <Badge className="!px-1.5 !py-0 text-[9px]">{SOURCE[r.source] ?? r.source}</Badge>}
                  </p>
                  <p className="text-xs text-on-surface-variant">{describeRule(r)}</p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">{r.matches} matching transaction{r.matches === 1 ? "" : "s"}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" aria-label="Edit rule" onClick={() => setEditing(r.id)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"><Icon name="edit" size={16} /></button>
                  <button type="button" aria-label="Delete rule" onClick={() => remove(r)} className="rounded-md p-1.5 text-on-surface-variant hover:bg-error-container/30 hover:text-error"><Icon name="delete" size={16} /></button>
                </div>
              </div>
            )
          )
        )}
      </div>
    </Panel>
  )
}
