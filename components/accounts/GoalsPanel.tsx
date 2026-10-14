"use client"

import { useState } from "react"
import { Panel } from "@/components/ui/Panel"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState, Notice } from "@/components/ui/States"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { cashBalance } from "@/lib/finance"
import type { Account, SavingsGoal } from "@/lib/types"

interface Props {
  goals: SavingsGoal[]
  accounts: Account[]
  setupRequired: boolean
  onChange: (goals: SavingsGoal[]) => void
}

const INPUT =
  "h-10 rounded-lg border border-white/10 bg-surface-container-lowest px-3 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"

export function GoalsPanel({ goals, accounts, setupRequired, onChange }: Props) {
  const { notify } = useFinance()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [saving, setSaving] = useState(false)
  const byId = new Map(accounts.map((a) => [a.id, a]))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { goal } = await sendJson<{ goal: SavingsGoal }>("/api/goals", "POST", { name, target_amount: Number(target), account_id: accountId || null })
      onChange([...goals, goal])
      setName(""); setTarget(""); setAdding(false)
      notify("Goal created")
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't create goal", "error")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      await sendJson(`/api/goals?id=${id}`, "DELETE")
      onChange(goals.filter((g) => g.id !== id))
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't delete goal", "error")
    }
  }

  return (
    <Panel
      title="Savings Goals"
      icon="flag"
      iconClass="text-tertiary"
      className="h-full"
      action={!adding && !setupRequired && <Button size="sm" icon="add" onClick={() => setAdding(true)}>New goal</Button>}
    >
      {setupRequired && (
        <Notice tone="warning">
          Goals need the database migration. Run <code className="text-xs">supabase/migrations/20261014_web_features.sql</code> in the Supabase SQL editor.
        </Notice>
      )}

      {adding && (
        <form onSubmit={add} className="mb-4 flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
          <input className={INPUT} placeholder="Goal name (e.g. Emergency fund)" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <input className={INPUT} type="number" min={1} step="any" placeholder="Target $" value={target} onChange={(e) => setTarget(e.target.value)} required />
            <select className={INPUT} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Tracked account">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" variant="primary" type="submit" loading={saving}>Create goal</Button>
          </div>
        </form>
      )}

      {!setupRequired && goals.length === 0 && !adding ? (
        <EmptyState icon="flag" title="No goals yet">Track progress toward an emergency fund, a trip, or a down payment using a real account balance.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const acct = g.account_id ? byId.get(g.account_id) : undefined
            const current = acct ? cashBalance(acct) : 0
            const pct = (current / g.target_amount) * 100
            return (
              <li key={g.id} className="group flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px] text-on-surface-variant">{acct ? `Tracking ${acct.name}` : "No linked account"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-tertiary">{Math.min(100, pct).toFixed(0)}%</span>
                    <button type="button" aria-label={`Delete ${g.name}`} onClick={() => remove(g.id)} className="text-on-surface-variant opacity-0 transition-opacity hover:text-error group-hover:opacity-100">
                      <Icon name="delete" size={16} />
                    </button>
                  </div>
                </div>
                <ProgressBar value={pct} fill="bg-gradient-to-r from-tertiary-container to-tertiary" track="bg-surface-container-lowest" />
                <div className="flex justify-between text-[11px] text-on-surface-variant">
                  <span>Current: <Money value={current} /></span>
                  <span>{pct >= 100 ? "Goal reached" : <><Money value={g.target_amount - current} cents={false} /> to go</>}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
