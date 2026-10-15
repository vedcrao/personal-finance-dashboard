"use client"

import { useApi, sendJson } from "@/components/hooks/useApi"
import { useFinance } from "@/components/providers/FinanceProvider"
import { PlaidUpdateButton } from "@/components/PlaidUpdateButton"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Skeleton } from "@/components/ui/States"
import { useState } from "react"

interface Bank {
  institution_name: string
  plaid_item_id: string
  last_synced_at: string | null
  status: string
  status_detail: string | null
  webhook: string | null
  missing: string[]
}

const PRODUCT_LABEL: Record<string, string> = { investments: "Investments (holdings)", auth: "Account numbers", liabilities: "Card statements" }

function ago(iso: string | null) {
  if (!iso) return "never"
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export function ConnectionsPanel() {
  const { data, loading, reload } = useApi<{ banks: Bank[] }>("/api/plaid/connected-banks")
  const { notify, refresh, closedAccounts } = useFinance()
  const [registering, setRegistering] = useState(false)
  const banks = data?.banks ?? []
  const withWebhook = banks.filter((b) => b.webhook).length

  async function registerWebhooks() {
    setRegistering(true)
    try {
      const r = await sendJson<{ results: { institution: string; ok: boolean; error?: string }[] }>("/api/plaid/webhook/register", "POST")
      const failed = r.results.filter((x) => !x.ok)
      notify(failed.length ? `Webhook failed for ${failed.map((f) => f.institution).join(", ")}` : "Automatic updates enabled for all banks", failed.length ? "error" : "success")
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't register webhooks", "error")
    } finally {
      setRegistering(false)
    }
  }

  return (
    <Panel
      title="Connections"
      icon="hub"
      iconClass="text-secondary"
      padded={false}
      action={
        <div className="flex items-center gap-2">
          <Badge tone={withWebhook === banks.length && banks.length ? "positive" : "warning"} icon="bolt">
            Auto-update {withWebhook}/{banks.length}
          </Badge>
          <Button size="sm" icon="webhook" loading={registering} onClick={registerWebhooks}>Enable auto-updates</Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2 p-6"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {banks.map((b) => (
            <li key={b.plaid_item_id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.status === "ok" ? "bg-tertiary/10 text-tertiary" : "bg-error-container/30 text-error"}`}>
                  <Icon name={b.status === "ok" ? "account_balance" : "link_off"} size={18} />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {b.institution_name}
                    {b.webhook && <Icon name="bolt" size={14} className="text-tertiary" />}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {b.status === "login_required" ? "Login expired. Reconnect to keep syncing"
                      : b.status === "pending_expiration" ? "Access expiring soon. Reconnect"
                      : b.status === "error" ? `Sync error: ${b.status_detail ?? "unknown"}`
                      : `Synced ${ago(b.last_synced_at)}`}
                    {b.missing.length > 0 && ` · missing: ${b.missing.map((m) => PRODUCT_LABEL[m] ?? m).join(", ")}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {b.status !== "ok" && (
                  <PlaidUpdateButton itemId={b.plaid_item_id} label="Reconnect"
                    onDone={async () => { notify(`${b.institution_name} reconnected`); await reload() }}
                    onError={(m) => notify(m, "error")} />
                )}
                {b.status === "ok" && b.missing.length > 0 && (
                  <PlaidUpdateButton itemId={b.plaid_item_id} consent={b.missing}
                    label={b.missing.includes("investments") ? "Grant investments access" : "Grant access"}
                    onDone={async () => { notify(`${b.institution_name} updated`); await reload(); await refresh() }}
                    onError={(m) => notify(m, "error")} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {closedAccounts.length > 0 && (
        <div className="border-t border-white/5 px-6 py-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            <Icon name="inventory_2" size={14} /> Closed accounts (hidden)
          </p>
          <ul className="flex flex-col gap-1">
            {closedAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>{a.institution_name} · {a.name}{a.mask ? ` ••${a.mask}` : ""}</span>
                <span>No longer reported by the bank</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-on-surface-variant">Their past transactions are kept; they&apos;re just left out of balances and net worth.</p>
        </div>
      )}
    </Panel>
  )
}
