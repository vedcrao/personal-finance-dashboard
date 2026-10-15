"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { PerformancePanel } from "@/components/investments/PerformancePanel"
import { AllocationPanel, type Slice } from "@/components/investments/AllocationPanel"
import { HoldingsTable, type HoldingRow } from "@/components/investments/HoldingsTable"
import { InvestmentActivity } from "@/components/investments/InvestmentActivity"
import { AccountPicker, accountGain, type PickerOption } from "@/components/investments/AccountPicker"
import { Panel } from "@/components/ui/Panel"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { EmptyState } from "@/components/ui/States"
import { SECURITY_TYPE_LABELS } from "@/lib/finance"
import type { Holding } from "@/lib/types"

type AllocBy = "type" | "sector"

/** The allocation group a holding belongs to (must match the slice labels). */
function groupOf(h: Holding, by: AllocBy): string {
  if (by === "sector") return h.sector ?? (h.security_type === "etf" || h.security_type === "mutual fund" ? "Funds (diversified)" : "Unclassified")
  return SECURITY_TYPE_LABELS[h.security_type ?? "other"] ?? "Other"
}

export default function InvestmentsPage() {
  const { accounts } = useFinance()
  const investAccounts = useMemo(() => accounts.filter((a) => a.type === "investment"), [accounts])
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [allocBy, setAllocBy] = useState<AllocBy>("type")
  const [group, setGroup] = useState<string | null>(null)

  const scoped = useMemo(
    () => (accountFilter ? investAccounts.filter((a) => a.id === accountFilter) : investAccounts),
    [investAccounts, accountFilter]
  )
  const value = scoped.reduce((s, a) => s + (a.current_balance ?? 0), 0)

  const rows: HoldingRow[] = useMemo(
    () => scoped.flatMap((a) => a.holdings.map((h) => ({ ...h, accountId: a.id, accountName: a.name, accountBalance: a.current_balance ?? 0 }))),
    [scoped]
  )
  const needsConsent = investAccounts.length > 0 && investAccounts.every((a) => a.holdings.length === 0)

  const withBasis = rows.filter((r) => r.cost_basis !== null)
  const costBasis = withBasis.length ? withBasis.reduce((s, r) => s + (r.cost_basis ?? 0), 0) : null
  const valueWithBasis = withBasis.reduce((s, r) => s + r.value, 0)
  const hasSectors = rows.some((r) => r.sector)
  const by: AllocBy = allocBy === "sector" && hasSectors ? "sector" : "type"

  const slices: Slice[] = useMemo(() => {
    if (!rows.length) return scoped.map((a) => ({ label: a.name, value: a.current_balance ?? 0 }))
    const m = new Map<string, { value: number; count: number }>()
    for (const r of rows) {
      const k = groupOf(r, by)
      const cur = m.get(k) ?? { value: 0, count: 0 }
      m.set(k, { value: cur.value + r.value, count: cur.count + 1 })
    }
    return [...m.entries()].map(([label, v]) => ({ label, ...v }))
  }, [rows, scoped, by])

  // A selected group that no longer exists (switched account / type↔sector) is ignored
  const activeGroup = group && slices.some((s) => s.label === group) ? group : null
  const visibleRows = activeGroup ? rows.filter((r) => groupOf(r, by) === activeGroup) : rows

  if (investAccounts.length === 0) {
    return (
      <Panel>
        <EmptyState icon="monitoring" title="No investment accounts linked">Connect a brokerage or retirement account to track your portfolio.</EmptyState>
      </Panel>
    )
  }

  const options: PickerOption[] = [
    {
      id: null, name: "All accounts",
      detail: `${investAccounts.length} accounts · ${investAccounts.reduce((s, a) => s + a.holdings.length, 0)} positions`,
      balance: investAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0),
      gain: accountGain(investAccounts.flatMap((a) => a.holdings)),
    },
    ...investAccounts.map((a) => ({
      id: a.id, name: a.name,
      detail: `${a.subtype ?? "investment"}${a.mask ? ` •• ${a.mask}` : ""}${a.holdings.length ? ` · ${a.holdings.length} positions` : ""}`,
      balance: a.current_balance ?? 0,
      gain: accountGain(a.holdings),
    })),
  ]

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <AccountPicker options={options} value={accountFilter} onChange={(id) => { setAccountFilter(id); setGroup(null) }} />
      </div>

      <div className="col-span-12 xl:col-span-8">
        <PerformancePanel value={value} costBasis={costBasis} holdingsValueWithBasis={valueWithBasis} accountId={accountFilter} />
      </div>

      <div className="col-span-12 xl:col-span-4">
        <AllocationPanel
          slices={slices}
          title="Allocation"
          selected={rows.length ? activeGroup : null}
          onSelect={rows.length ? setGroup : undefined}
          subtitle={
            rows.length ? (
              hasSectors ? (
                <SegmentedControl size="sm" ariaLabel="Allocation by" value={allocBy} onChange={(v) => { setAllocBy(v); setGroup(null) }}
                  options={[{ value: "type", label: "Asset type" }, { value: "sector", label: "Sector" }]} />
              ) : "by asset type"
            ) : "by account"
          }
        />
      </div>

      <div className="col-span-12 2xl:col-span-8">
        <HoldingsTable rows={visibleRows} needsConsent={needsConsent} filterLabel={activeGroup} onClearFilter={() => setGroup(null)} />
      </div>
      <div className="col-span-12 2xl:col-span-4">
        <InvestmentActivity accounts={investAccounts} accountId={accountFilter} enabled={!needsConsent} />
      </div>
    </div>
  )
}
