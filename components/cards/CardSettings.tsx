"use client"

import { useState } from "react"
import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { utilization } from "@/lib/finance"
import type { Account } from "@/lib/types"

function Row({ icon, iconClass = "text-on-surface", title, subtitle, children }: { icon: string; iconClass?: string; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-surface-container/60">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high ${iconClass}`}>
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-on-surface-variant">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Card-level details and the editable statement closing day (used for statement-period views). */
export function CardSettings({ account }: { account: Account }) {
  const { refresh, notify } = useFinance()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  const util = utilization(account.current_balance ?? 0, account.credit_limit)
  const available = account.available_balance ?? (account.credit_limit !== null ? account.credit_limit - (account.current_balance ?? 0) : null)

  async function save() {
    const day = Number(draft)
    if (!Number.isInteger(day) || day < 1 || day > 31) return notify("Enter a day between 1 and 31", "error")
    setSaving(true)
    try {
      await sendJson(`/api/accounts/${account.id}`, "PATCH", { billing_cycle_day: day })
      setEditing(false)
      notify("Statement closing day saved")
      await refresh()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Card Details" icon="tune" iconClass="text-primary" padded={false} className="h-full">
      <div className="divide-y divide-white/[0.04]">
        <div className="px-6 py-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">Utilization</span>
            <span className={util === null ? "text-on-surface-variant" : util < 10 ? "text-tertiary" : util < 30 ? "text-secondary" : "text-error"}>
              {util === null ? "Limit unavailable" : `${util.toFixed(1)}%`}
            </span>
          </div>
          <ProgressBar
            value={util ?? 0}
            fill={util !== null && util >= 30 ? "bg-gradient-to-r from-amber-400 to-error" : "bg-gradient-to-r from-secondary-container via-primary-container to-secondary"}
          />
          <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
            <span>Available {available !== null ? <Money value={available} cents={false} /> : "—"}</span>
            <span>Limit {account.credit_limit !== null ? <Money value={account.credit_limit} cents={false} /> : "—"}</span>
          </div>
        </div>

        <Row icon="calendar_month" iconClass="text-secondary" title="Statement closing day" subtitle="Used to split spending by billing period">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); void save() }} className="flex items-center gap-1.5">
              <input
                autoFocus type="number" min={1} max={31} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="14"
                className="w-14 rounded-md border border-white/10 bg-surface-container-lowest px-2 py-1 text-sm tabular outline-none focus:border-indigo-brand"
              />
              <button type="submit" disabled={saving} className="text-xs font-semibold text-secondary">Save</button>
              <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="text-on-surface-variant"><Icon name="close" size={16} /></button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setDraft(account.billing_cycle_day?.toString() ?? ""); setEditing(true) }}
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold hover:bg-surface-bright"
            >
              {account.billing_cycle_day ? `Day ${account.billing_cycle_day}` : "Set day"}
              <Icon name="edit" size={14} className="text-on-surface-variant" />
            </button>
          )}
        </Row>

        <Row icon="account_balance" title="Issuer" subtitle={account.institution_name}>
          <span className="text-xs text-on-surface-variant">{account.mask ? `•• ${account.mask}` : ""}</span>
        </Row>

        <Row icon="verified_user" iconClass="text-tertiary" title="Connection" subtitle="Read-only via Plaid — this app can't move money">
          <span className="flex items-center gap-1 rounded-full bg-tertiary-container/15 px-2 py-1 text-[11px] font-semibold text-tertiary">
            <Icon name="check" size={14} /> Synced
          </span>
        </Row>
      </div>
    </Panel>
  )
}
