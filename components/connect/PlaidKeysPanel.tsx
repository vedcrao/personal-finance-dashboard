"use client"

import { useState } from "react"
import { useApi } from "@/components/hooks/useApi"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Skeleton } from "@/components/ui/States"

interface Me { username: string | null; email: string; plaid: { client_id: string; environment: string; updated_at: string } | null }

const INPUT = "h-10 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 font-mono text-sm outline-none focus:border-indigo-brand"

/** View / replace the signed-in user's Plaid keys. */
export function PlaidKeysPanel() {
  const { data, loading, reload } = useApi<Me>("/api/auth/me")
  const { notify } = useFinance()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ plaid_client_id: "", plaid_secret: "", plaid_env: "sandbox" })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch("/api/auth/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return notify(j.error ?? "Couldn't save keys", "error")
    notify("Plaid keys updated")
    setEditing(false)
    setF({ plaid_client_id: "", plaid_secret: "", plaid_env: "sandbox" })
    await reload()
  }

  return (
    <Panel title="Plaid keys" icon="key" iconClass="text-secondary"
      action={!editing && <Button size="sm" icon="edit" onClick={() => setEditing(true)}>Change</Button>}>
      {loading ? <Skeleton className="h-12" /> : !editing ? (
        data?.plaid ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-mono text-on-surface-variant">{data.plaid.client_id}</span>
            <Badge tone={data.plaid.environment === "production" ? "positive" : "warning"}>{data.plaid.environment}</Badge>
          </div>
        ) : <p className="text-sm text-error">No Plaid keys saved. Add them to connect banks.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <input className={INPUT} placeholder="client_id" autoComplete="off" value={f.plaid_client_id} onChange={(e) => setF({ ...f, plaid_client_id: e.target.value })} />
          <input className={INPUT} placeholder="secret" type="password" autoComplete="off" value={f.plaid_secret} onChange={(e) => setF({ ...f, plaid_secret: e.target.value })} />
          <select className={INPUT} value={f.plaid_env} onChange={(e) => setF({ ...f, plaid_env: e.target.value })}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
          <p className="text-[11px] text-on-surface-variant">Banks already linked keep working only if these keys belong to the same Plaid account.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" variant="primary" loading={saving} onClick={save}>Verify & save</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
