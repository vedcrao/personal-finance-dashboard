"use client"

import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { cashBalance } from "@/lib/finance"
import type { Account, SavingsGoal } from "@/lib/types"

interface Props {
  account: Account
  isPrimary: boolean
  interestThisMonth: number
  goals: SavingsGoal[]
  selected: boolean
  onSelect: () => void
  onShowNumbers: () => void
}

export function AccountCard({ account, isPrimary, interestThisMonth, goals, selected, onSelect, onShowNumbers }: Props) {
  const { refresh, notify } = useFinance()
  const isSavings = account.subtype === "savings" || account.subtype === "money market" || account.subtype === "cd"
  const balance = cashBalance(account)

  const [editingApy, setEditingApy] = useState(false)
  const [apyDraft, setApyDraft] = useState("")

  async function saveApy() {
    try {
      await sendJson(`/api/accounts/${account.id}`, "PATCH", { apy: apyDraft === "" ? null : Number(apyDraft) })
      setEditingApy(false)
      notify("APY saved")
      await refresh()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save APY", "error")
    }
  }

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long" })

  return (
    <section
      className={`glass relative flex flex-col gap-4 overflow-hidden rounded-2xl p-5 shadow-lg transition-all duration-300 ${
        selected ? "!border-indigo-brand/40 ring-1 ring-indigo-brand/30" : ""
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${isSavings ? "via-tertiary/40" : "via-secondary/40"} to-transparent`} />
      {isSavings && <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-tertiary/5 blur-2xl" />}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSavings ? "bg-tertiary/15 text-tertiary shadow-[0_0_16px_rgba(78,222,163,0.2)]" : "bg-secondary/15 text-secondary shadow-[0_0_12px_rgba(76,215,246,0.15)]"}`}>
            <Icon name={isSavings ? "savings" : "account_balance"} size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {account.name} {account.mask && <span className="font-normal text-on-surface-variant">•• {account.mask}</span>}
            </p>
            {isSavings && interestThisMonth > 0 ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-tertiary">
                <Icon name="auto_graph" size={14} /> +<Money value={interestThisMonth} /> earned in {monthLabel}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-on-surface-variant">{account.institution_name}</p>
            )}
          </div>
        </div>

        {isSavings ? (
          editingApy ? (
            <form onSubmit={(e) => { e.preventDefault(); void saveApy() }} className="flex items-center gap-1">
              <input
                autoFocus type="number" step="0.01" min={0} max={100} value={apyDraft} onChange={(e) => setApyDraft(e.target.value)}
                placeholder="4.50"
                className="w-16 rounded-md border border-white/10 bg-surface-container-lowest px-1.5 py-0.5 text-xs tabular outline-none focus:border-tertiary"
              />
              <span className="text-xs text-on-surface-variant">%</span>
              <button type="submit" aria-label="Save APY" className="text-tertiary"><Icon name="check" size={16} /></button>
            </form>
          ) : (
            <button type="button" onClick={() => { setApyDraft(account.apy?.toString() ?? ""); setEditingApy(true) }} title="Edit APY">
              {account.apy !== null ? (
                <Badge tone="positive" glow className="!py-1 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-tertiary" /> {account.apy}% APY
                </Badge>
              ) : (
                <Badge tone="neutral" icon="add">Add APY</Badge>
              )}
            </button>
          )
        ) : (
          <Badge tone="neutral">{isPrimary ? "Primary" : account.subtype ?? "Bank"}</Badge>
        )}
      </div>

      <div>
        <p className="text-xs text-on-surface-variant">{isSavings ? "Vaulted balance" : "Available balance"}</p>
        <Money value={balance} className={`mt-0.5 block text-2xl font-bold tracking-tight ${isSavings ? "text-tertiary" : ""}`} />
        {account.available_balance !== null && account.current_balance !== null && account.available_balance !== account.current_balance && (
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            Current <Money value={account.current_balance} /> · pending activity not yet cleared
          </p>
        )}
      </div>

      {goals.map((g) => {
        const pct = (balance / g.target_amount) * 100
        return (
          <div key={g.id} className="flex flex-col gap-2 rounded-xl bg-surface-container-high p-3">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="flex items-center gap-1.5"><Icon name="flag" size={15} className="text-tertiary" /> {g.name}</span>
              <span className="text-on-surface-variant"><strong className="text-tertiary">{Math.min(100, pct).toFixed(0)}%</strong> of <Money value={g.target_amount} cents={false} /></span>
            </div>
            <ProgressBar value={pct} fill="bg-gradient-to-r from-tertiary-container to-tertiary" track="bg-surface-container-lowest" glow />
            <p className="text-right text-[11px] text-on-surface-variant">
              {pct >= 100 ? "Goal reached" : <><Money value={g.target_amount - balance} cents={false} /> to goal</>}
            </p>
          </div>
        )
      })}

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
        {[
          { icon: "tag", label: "Routing & No.", onClick: onShowNumbers, cls: isSavings ? "text-tertiary" : "text-secondary" },
          { icon: "swap_vert", label: selected ? "Showing activity" : "Activity", onClick: onSelect, cls: "text-on-surface-variant" },
        ].map((b) => (
          <button
            key={b.icon}
            type="button"
            onClick={b.onClick}
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-container-high px-1 py-2 text-[11px] font-semibold transition-colors hover:bg-surface-bright active:scale-95"
          >
            <Icon name={b.icon} size={18} className={b.cls} />
            {b.label}
          </button>
        ))}
        <Link
          href={`/transactions?account=${account.id}`}
          className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-container-high px-1 py-2 text-[11px] font-semibold transition-colors hover:bg-surface-bright"
        >
          <Icon name="receipt_long" size={18} className="text-on-surface-variant" />
          Statements
        </Link>
      </div>
    </section>
  )
}
