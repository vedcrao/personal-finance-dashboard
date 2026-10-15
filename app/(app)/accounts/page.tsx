"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { useApi } from "@/components/hooks/useApi"
import { AccountCard } from "@/components/accounts/AccountCard"
import { AccountNumbersModal } from "@/components/accounts/AccountNumbersModal"
import { GoalsPanel } from "@/components/accounts/GoalsPanel"
import { CashFlowInsights } from "@/components/accounts/CashFlowInsights"
import { TransactionItem } from "@/components/transactions/TransactionItem"
import { Panel, SectionLabel } from "@/components/ui/Panel"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { EmptyState } from "@/components/ui/States"
import { cashBalance, currentMonthRange, flowType, inRange, isInterest, type FlowType } from "@/lib/finance"
import type { Account, SavingsGoal } from "@/lib/types"

type Filter = "all" | "checking" | "savings"
type Flow = "all" | FlowType

const SAVINGS_SUBTYPES = new Set(["savings", "money market", "cd", "hsa"])
const isSavings = (a: Account) => SAVINGS_SUBTYPES.has(a.subtype ?? "")

export default function AccountsPage() {
  const { accounts, transactions } = useFinance()
  const goalsApi = useApi<{ goals: SavingsGoal[] }>("/api/goals")
  const goals = goalsApi.data?.goals ?? []

  const [filter, setFilter] = useState<Filter>("all")
  const [flow, setFlow] = useState<Flow>("all")
  const [activityAccount, setActivityAccount] = useState<string | null>(null)
  const [numbersFor, setNumbersFor] = useState<Account | null>(null)

  const cashAccounts = useMemo(() => accounts.filter((a) => a.type === "depository"), [accounts])
  const checking = cashAccounts.filter((a) => !isSavings(a))
  const savings = cashAccounts.filter(isSavings)
  const visible = filter === "checking" ? checking : filter === "savings" ? savings : cashAccounts
  const primaryId = [...checking].sort((a, b) => cashBalance(b) - cashBalance(a))[0]?.id

  const cashIds = useMemo(() => new Set(cashAccounts.map((a) => a.id)), [cashAccounts])
  const cashTxns = useMemo(() => transactions.filter((t) => cashIds.has(t.account_id)), [transactions, cashIds])

  const { start, end } = currentMonthRange()
  const interestByAccount = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of cashTxns) if (isInterest(t) && inRange(t.date, start, end)) m.set(t.account_id, (m.get(t.account_id) ?? 0) - t.amount)
    return m
  }, [cashTxns, start, end])

  const total = cashAccounts.reduce((s, a) => s + cashBalance(a), 0)
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const activity = cashTxns
    .filter((t) => (activityAccount ? t.account_id === activityAccount : true))
    .filter((t) => flow === "all" || flowType(t) === flow)
    .slice(0, 25)

  if (cashAccounts.length === 0) {
    return (
      <Panel>
        <EmptyState icon="account_balance" title="No checking or savings accounts linked">Connect a bank from the Connect page to see your cash here.</EmptyState>
      </Panel>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Liquid wealth pulse */}
      <div className="col-span-12 xl:col-span-8">
        <Panel glow="secondary" className="h-full">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.8)]" />
            <SectionLabel>Cash &amp; banking</SectionLabel>
          </div>
          <Money value={total} splitCents className="mt-2 block text-[32px] leading-10 md:text-[40px] md:leading-[48px] font-bold tracking-[-0.03em]" />
          <p className="mt-1 text-sm text-on-surface-variant">
            Total liquid capital available across {cashAccounts.length} {cashAccounts.length === 1 ? "account" : "accounts"}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-5 md:grid-cols-3">
            {[
              { label: "Checking", value: checking.reduce((s, a) => s + cashBalance(a), 0), icon: "account_balance_wallet", cls: "bg-secondary/10 text-secondary", vcls: "" },
              { label: "Savings", value: savings.reduce((s, a) => s + cashBalance(a), 0), icon: "savings", cls: "bg-tertiary/10 text-tertiary", vcls: "text-tertiary" },
              { label: "Interest this month", value: [...interestByAccount.values()].reduce((s, v) => s + v, 0), icon: "auto_graph", cls: "bg-primary/10 text-primary", vcls: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg md:flex ${s.cls}`}><Icon name={s.icon} size={18} /></div>
                <div className="min-w-0">
                  <p className="text-xs text-on-surface-variant">{s.label}</p>
                  <Money value={s.value} className={`block truncate text-sm font-semibold ${s.vcls}`} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-4">
        <CashFlowInsights transactions={cashTxns} />
      </div>

      {/* Account cards */}
      <div className="col-span-12 flex items-center justify-between">
        <SegmentedControl<Filter>
          ariaLabel="Account filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All accounts (${cashAccounts.length})` },
            { value: "checking", label: `Checking (${checking.length})`, disabled: checking.length === 0 },
            { value: "savings", label: `Savings (${savings.length})`, disabled: savings.length === 0 },
          ]}
        />
      </div>
      {visible.map((a) => (
        <div key={a.id} className="col-span-12 md:col-span-6 2xl:col-span-4">
          <AccountCard
            account={a}
            isPrimary={a.id === primaryId}
            interestThisMonth={interestByAccount.get(a.id) ?? 0}
            goals={goals.filter((g) => g.account_id === a.id)}
            selected={activityAccount === a.id}
            onSelect={() => setActivityAccount((cur) => (cur === a.id ? null : a.id))}
            onShowNumbers={() => setNumbersFor(a)}
          />
        </div>
      ))}

      {/* Activity + goals */}
      <div className="col-span-12 xl:col-span-7">
        <Panel
          title="Recent Cash Activity"
          icon="history"
          iconClass="text-on-surface-variant"
          padded={false}
          action={
            activityAccount && (
              <button type="button" onClick={() => setActivityAccount(null)} className="flex items-center gap-1 rounded-full bg-indigo-brand/15 px-2.5 py-1 text-xs font-semibold text-primary">
                {accountById.get(activityAccount)?.name} <Icon name="close" size={14} />
              </button>
            )
          }
        >
          <div className="flex gap-2 overflow-x-auto px-6 py-3">
            {([
              ["all", "All flows"],
              ["income", "Income (+)"],
              ["outflow", "Outflow (−)"],
              ["transfer", "Transfers (↔)"],
            ] as [Flow, string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFlow(v)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  flow === v ? "bg-indigo-brand text-white" : "border border-white/[0.06] bg-white/[0.04] text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activity.length === 0 ? (
            <EmptyState icon="filter_alt_off" title="Nothing matches this filter" />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {activity.map((t) => <TransactionItem key={t.id} t={t} account={accountById.get(t.account_id)} />)}
            </div>
          )}
        </Panel>
      </div>
      <div className="col-span-12 xl:col-span-5">
        <GoalsPanel goals={goals} accounts={cashAccounts} setupRequired={goalsApi.setupRequired} onChange={(g) => goalsApi.setData({ goals: g })} />
      </div>

      <AccountNumbersModal account={numbersFor} onClose={() => setNumbersFor(null)} />
    </div>
  )
}
