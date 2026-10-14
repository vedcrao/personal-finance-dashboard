"use client"

import { useApi } from "@/components/hooks/useApi"
import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { EmptyState, Skeleton } from "@/components/ui/States"
import { relativeDay } from "@/lib/format"
import type { Account, InvestmentActivity as Activity } from "@/lib/types"

const STYLE: Record<string, { icon: string; cls: string; label: string }> = {
  buy: { icon: "add_shopping_cart", cls: "bg-primary/10 text-primary", label: "Bought" },
  sell: { icon: "sell", cls: "bg-amber-500/10 text-amber-300", label: "Sold" },
  dividend: { icon: "payments", cls: "bg-tertiary/10 text-tertiary", label: "Dividend" },
  contribution: { icon: "savings", cls: "bg-secondary/10 text-secondary", label: "Contribution" },
  fee: { icon: "receipt", cls: "bg-error-container/30 text-error", label: "Fee" },
}

function styleFor(a: Activity) {
  return STYLE[a.subtype] ?? STYLE[a.type] ?? { icon: "swap_horiz", cls: "bg-surface-container-highest text-on-surface-variant", label: a.subtype.replace(/_/g, " ") }
}

/** Buys, sells, dividends and contributions across investment accounts (Plaid Investments). */
export function InvestmentActivity({ accounts, accountId, enabled }: { accounts: Account[]; accountId: string | null; enabled: boolean }) {
  const { data, loading } = useApi<{ activity: Activity[]; errors: string[] }>(enabled ? "/api/investments/transactions?days=180" : null)
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const list = (data?.activity ?? []).filter((a) => !accountId || a.account_id === accountId).slice(0, 15)
  const dividends = (data?.activity ?? []).filter((a) => a.subtype === "dividend" && (!accountId || a.account_id === accountId))
    .reduce((s, a) => s - a.amount, 0)

  return (
    <Panel title="Recent Activity" icon="history" iconClass="text-on-surface-variant" padded={false} className="h-full"
      action={dividends > 0 && <span className="text-xs text-on-surface-variant">Dividends (6 mo) <Money value={dividends} className="font-semibold text-tertiary" /></span>}>
      {!enabled ? (
        <EmptyState icon="history" title="Needs investments access">Grant it on the Connect page to see buys, sells and dividends.</EmptyState>
      ) : loading ? (
        <div className="flex flex-col gap-2 p-6"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : list.length === 0 ? (
        <EmptyState icon="history" title="No investment activity in the last 6 months" />
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {list.map((a) => {
            const s = styleFor(a)
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.cls}`}><Icon name={s.icon} size={18} /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      <span className="capitalize">{s.label}</span> {a.ticker ?? a.security_name ?? a.name}
                    </p>
                    <p className="truncate text-[11px] text-on-surface-variant">
                      {a.quantity ? `${Math.abs(a.quantity).toLocaleString("en-US", { maximumFractionDigits: 4 })} @ $${a.price.toFixed(2)} · ` : ""}
                      {byId.get(a.account_id)?.name} · {relativeDay(a.date)}
                    </p>
                  </div>
                </div>
                {/* Plaid: positive amount = cash out of the account (buy), negative = cash in (sell/dividend) */}
                <Money value={-a.amount} sign className={`shrink-0 text-sm font-semibold ${a.amount < 0 ? "text-tertiary" : ""}`} />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
