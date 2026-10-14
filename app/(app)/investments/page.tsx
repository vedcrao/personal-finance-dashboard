"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { PerformancePanel } from "@/components/investments/PerformancePanel"
import { AllocationPanel, type Slice } from "@/components/investments/AllocationPanel"
import { HoldingsTable, type HoldingRow } from "@/components/investments/HoldingsTable"
import { InvestmentActivity } from "@/components/investments/InvestmentActivity"
import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { EmptyState } from "@/components/ui/States"
import { SECURITY_TYPE_LABELS } from "@/lib/finance"
import type { Account } from "@/lib/types"

function accountGain(a: Account) {
  const withBasis = a.holdings.filter((h) => h.cost_basis !== null)
  if (!withBasis.length) return null
  const basis = withBasis.reduce((s, h) => s + (h.cost_basis ?? 0), 0)
  const gain = withBasis.reduce((s, h) => s + h.value, 0) - basis
  return { gain, pct: basis ? (gain / basis) * 100 : 0 }
}

export default function InvestmentsPage() {
  const { accounts } = useFinance()
  const investAccounts = useMemo(() => accounts.filter((a) => a.type === "investment"), [accounts])
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [allocBy, setAllocBy] = useState<"type" | "sector">("type")

  const scoped = useMemo(
    () => (accountFilter ? investAccounts.filter((a) => a.id === accountFilter) : investAccounts),
    [investAccounts, accountFilter]
  )
  const value = scoped.reduce((s, a) => s + (a.current_balance ?? 0), 0)

  const rows: HoldingRow[] = useMemo(
    () => scoped.flatMap((a) => a.holdings.map((h) => ({ ...h, accountId: a.id, accountName: a.name, accountBalance: a.current_balance ?? 0 }))),
    [scoped]
  )
  // Plaid returns no holdings at all when the Item lacks Investments consent
  const needsConsent = investAccounts.length > 0 && investAccounts.every((a) => a.holdings.length === 0)

  const withBasis = rows.filter((r) => r.cost_basis !== null)
  const costBasis = withBasis.length ? withBasis.reduce((s, r) => s + (r.cost_basis ?? 0), 0) : null
  const valueWithBasis = withBasis.reduce((s, r) => s + r.value, 0)
  const hasSectors = rows.some((r) => r.sector)

  const slices: Slice[] = useMemo(() => {
    if (!rows.length) return scoped.map((a) => ({ label: a.name, value: a.current_balance ?? 0 }))
    const m = new Map<string, number>()
    for (const r of rows) {
      const label = allocBy === "sector" && hasSectors
        ? r.sector ?? (r.security_type === "etf" || r.security_type === "mutual fund" ? "Funds (diversified)" : "Unclassified")
        : SECURITY_TYPE_LABELS[r.security_type ?? "other"] ?? "Other"
      m.set(label, (m.get(label) ?? 0) + r.value)
    }
    const held = rows.reduce((s, r) => s + r.value, 0)
    if (value - held > 1) m.set("Uninvested cash", (m.get("Uninvested cash") ?? 0) + (value - held))
    return [...m.entries()].map(([label, v]) => ({ label, value: v }))
  }, [rows, scoped, value, allocBy, hasSectors])

  if (investAccounts.length === 0) {
    return (
      <Panel>
        <EmptyState icon="monitoring" title="No investment accounts linked">Connect a brokerage or retirement account to track your portfolio.</EmptyState>
      </Panel>
    )
  }

  const allEntry = {
    id: null as string | null, name: "All accounts", subtype: `${investAccounts.length} accounts`, mask: null as string | null,
    current_balance: investAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0), holdings: investAccounts.flatMap((a) => a.holdings),
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 xl:col-span-8">
        <PerformancePanel value={value} costBasis={costBasis} holdingsValueWithBasis={valueWithBasis} accountId={accountFilter} />
      </div>

      <div className="col-span-12 flex flex-col gap-6 xl:col-span-4">
        <Panel title="Accounts" icon="account_balance" iconClass="text-secondary" padded={false}>
          <ul className="divide-y divide-white/[0.04]">
            {[allEntry, ...investAccounts].map((a) => {
              const active = accountFilter === a.id
              const g = accountGain(a as Account)
              return (
                <li key={a.id ?? "all"}>
                  <button
                    type="button"
                    onClick={() => setAccountFilter(a.id)}
                    className={`flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors ${active ? "bg-indigo-brand/10" : "hover:bg-surface-container-high/40"}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon name={a.id ? "work" : "select_all"} size={18} className={active ? "text-primary" : "text-on-surface-variant"} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-[11px] uppercase text-on-surface-variant">
                          {a.subtype ?? "investment"}{a.mask ? ` •• ${a.mask}` : ""}
                          {a.holdings.length > 0 && ` · ${a.holdings.length} positions`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <Money value={a.current_balance ?? 0} cents={false} className="text-sm font-semibold" />
                      {g && (
                        <span className={`text-[11px] font-semibold ${g.gain >= 0 ? "text-tertiary" : "text-error"}`}>
                          <Money value={g.gain} sign cents={false} /> ({g.pct >= 0 ? "+" : ""}{g.pct.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        <AllocationPanel
          slices={slices}
          title="Allocation"
          subtitle={
            rows.length ? (
              hasSectors ? (
                <SegmentedControl size="sm" ariaLabel="Allocation by" value={allocBy} onChange={setAllocBy}
                  options={[{ value: "type", label: "Asset type" }, { value: "sector", label: "Sector" }]} />
              ) : "by asset type"
            ) : "by account"
          }
        />
      </div>

      <div className="col-span-12 2xl:col-span-8">
        <HoldingsTable rows={rows} needsConsent={needsConsent} />
      </div>
      <div className="col-span-12 2xl:col-span-4">
        <InvestmentActivity accounts={investAccounts} accountId={accountFilter} enabled={!needsConsent} />
      </div>
    </div>
  )
}
