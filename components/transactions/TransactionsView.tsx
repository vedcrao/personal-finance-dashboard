"use client"

import { Fragment, useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { EmptyState } from "@/components/ui/States"
import { RecurringView } from "./RecurringView"
import { ZelleSummary } from "./ZelleSummary"
import { P2P_CATEGORY } from "@/lib/categories"
import { MonthScroller, monthRange } from "./MonthScroller"
import { TransactionItem } from "./TransactionItem"
import {
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER, categoryBreakdown, categoryStyle, formatLocation, getBillingPeriods,
  flowLabel, flowOf, isMatchedRefund, isSpend, spendAmount, spendDate, ymd, type Flow,
} from "@/lib/finance"
import { shortDate } from "@/lib/format"
import type { Transaction } from "@/lib/types"


const FLOW_PILL: Record<Flow, string> = {
  income: "bg-tertiary/10 text-tertiary",
  expense: "bg-rose-500/10 text-rose-300",
  reimbursement: "bg-secondary/10 text-secondary",
  transfer: "bg-surface-container-highest text-on-surface-variant",
}

export interface TransactionsViewProps {
  initial: { account: string | null; tab: "transactions" | "recurring"; view: "month" | "statement"; month: string | null; category: string | null }
}

export function TransactionsView({ initial }: TransactionsViewProps) {
  const { accounts, transactions, loading, editTransaction, hidden } = useFinance()
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const [tab, setTab] = useState(initial.tab)
  const [accountId, setAccountId] = useState<string | null>(initial.account && accountById.has(initial.account) ? initial.account : null)
  const account = accountId ? accountById.get(accountId) : undefined
  const canStatement = account?.type === "credit" && !!account.billing_cycle_day

  const [viewMode, setViewMode] = useState<"month" | "statement">(initial.view === "statement" ? "statement" : "month")
  const effectiveView = canStatement ? viewMode : "month"
  const currentMonth = ymd(new Date()).slice(0, 7)
  const [month, setMonth] = useState(initial.month ?? currentMonth)
  const periods = canStatement ? getBillingPeriods(account!.billing_cycle_day!) : []
  const [periodIdx, setPeriodIdx] = useState(2)

  const [category, setCategory] = useState<string | null>(initial.category)
  const [location, setLocation] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [showLocation, setShowLocation] = useState(false)
  // The full list only opens once you pick something: keeps the page calm
  const [showAll, setShowAll] = useState(!!initial.account)

  const scoped = useMemo(() => (accountId ? transactions.filter((t) => t.account_id === accountId) : transactions), [transactions, accountId])

  // Month strip: every month since your first transaction, with that month's spending
  const allMonths = useMemo(() => {
    const earliest = transactions.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null)
    const list = monthRange(earliest)
    return initial.month && !list.includes(initial.month) ? [...list, initial.month].sort() : list
  }, [transactions, initial.month])
  const monthTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of scoped) m.set(spendDate(t).slice(0, 7), (m.get(spendDate(t).slice(0, 7)) ?? 0) + spendAmount(t))
    return m
  }, [scoped])

  const inPeriod = (d: string) => {
    if (effectiveView === "statement" && periods[periodIdx]) return d >= periods[periodIdx].start && d <= periods[periodIdx].end
    return d.startsWith(month)
  }

  const periodTxns = scoped.filter((t) => inPeriod(spendDate(t)))
  const spendTxns = periodTxns.filter(isSpend)
  const totalSpend = spendTxns.reduce((s, t) => s + spendAmount(t), 0)
  const cats = categoryBreakdown(periodTxns)
  const zelleCount = periodTxns.filter((t) => t.category === P2P_CATEGORY).length
  const topCategory = cats[0]

  const now = new Date()
  const projected =
    effectiveView === "month" && month === currentMonth
      ? (totalSpend / now.getDate()) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      : null

  const locationTotals = new Map<string, number>()
  for (const t of spendTxns) {
    const loc = formatLocation(t)
    if (loc) locationTotals.set(loc, (locationTotals.get(loc) ?? 0) + spendAmount(t))
  }
  const locations = [...locationTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  const q = query.trim().toLowerCase()
  const listOpen = showAll || !!category || !!location || !!q || !!accountId
  /** Back to the compact picker; also clears the filters that opened the list */
  const collapse = () => {
    setShowAll(false); setCategory(null); setLocation(null); setQuery(""); setAccountId(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const filtered = periodTxns.filter((t) => {
    if (category && (t.category ?? "Uncategorized") !== category) return false
    if (location && formatLocation(t) !== location) return false
    if (q && !`${t.merchant_name ?? ""} ${t.description} ${t.category ?? ""}`.toLowerCase().includes(q)) return false
    return true
  })

  const grouped: [string, Transaction[]][] = accountId
    ? [["", filtered]]
    : [
        ...ACCOUNT_TYPE_ORDER.map((type): [string, Transaction[]] => [type, filtered.filter((t) => accountById.get(t.account_id)?.type === type)]),
        ["closed", filtered.filter((t) => !accountById.has(t.account_id))] as [string, Transaction[]],
      ].filter(([, l]) => l.length > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="View"
            value={tab}
            onChange={setTab}
            options={[
              { value: "transactions", label: "Transactions" },
              { value: "recurring", label: "Recurring" },
            ]}
          />
          <label className="relative w-full md:w-auto">
            <span className="sr-only">Account</span>
            <select
              value={accountId ?? ""}
              onChange={(e) => { setAccountId(e.target.value || null); setViewMode("month") }}
              className="h-10 w-full max-w-full appearance-none truncate rounded-full border border-white/[0.08] bg-white/[0.04] pr-9 pl-4 text-sm font-semibold outline-none focus:border-indigo-brand md:w-auto md:max-w-xs"
            >
              <option value="">All accounts</option>
              {ACCOUNT_TYPE_ORDER.map((type) => {
                const group = accounts.filter((a) => a.type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
                    {group.map((a) => <option key={a.id} value={a.id}>{a.name}{a.mask ? ` ••${a.mask}` : ""}</option>)}
                  </optgroup>
                )
              })}
            </select>
            <Icon name="expand_more" size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-on-surface-variant" />
          </label>
        </div>

        {tab === "transactions" && canStatement && (
          <div className="flex flex-wrap items-center gap-2">
            {canStatement && (
              <SegmentedControl
                size="sm"
                ariaLabel="Period type"
                value={viewMode}
                onChange={setViewMode}
                options={[{ value: "month", label: "Month" }, { value: "statement", label: "Statement" }]}
              />
            )}
            {effectiveView === "statement" && (
              <div className="flex gap-1 overflow-x-auto">
                {periods.map((p, i) => (
                  <button key={p.end} type="button" onClick={() => setPeriodIdx(i)}
                    className={`rounded-xl px-3.5 py-1 text-left text-xs font-semibold leading-tight transition-colors ${periodIdx === i ? "bg-indigo-brand text-white" : "border border-white/[0.06] bg-white/[0.04] text-on-surface-variant hover:text-on-surface"}`}>
                    <div>{p.label}</div>
                    <div className="font-normal opacity-70">{shortDate(p.start)} → {shortDate(p.end)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tab === "transactions" && effectiveView === "month" && (
        <div className="glass rounded-2xl px-2 py-2">
          <MonthScroller months={allMonths} value={month} onChange={setMonth} totals={monthTotals} hidden={hidden} />
        </div>
      )}

      {tab === "recurring" ? (
        <RecurringView transactions={scoped} />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[
              { label: effectiveView === "statement" ? "Statement spend" : "Total spend", node: <Money value={totalSpend} />, sub: `${spendTxns.length} purchases`, icon: "payments", cls: "bg-secondary/10 text-secondary" },
              projected !== null
                ? { label: "Projected month", node: <Money value={projected} />, sub: "at current daily pace", icon: "trending_up", cls: "bg-primary/10 text-primary" }
                : { label: "Avg purchase", node: <Money value={spendTxns.length ? totalSpend / spendTxns.length : 0} />, sub: "per transaction", icon: "functions", cls: "bg-primary/10 text-primary" },
              { label: "Top category", node: <span className="truncate">{topCategory?.category ?? "—"}</span>, sub: topCategory ? <Money value={topCategory.amount} /> : "", icon: topCategory ? categoryStyle(topCategory.category).icon : "category", cls: "bg-amber-500/10 text-amber-300" },
              { label: "Flagged", node: <span>{periodTxns.filter((t) => t.is_anomaly).length}</span>, sub: "unusual transactions", icon: "gpp_maybe", cls: "bg-error-container/30 text-error" },
            ].map((c) => (
              <div key={c.label} className="glass flex items-start gap-3 rounded-2xl p-4 md:p-5">
                <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl md:flex ${c.cls}`}><Icon name={c.icon} size={20} /></div>
                <div className="min-w-0">
                  <p className="text-xs text-on-surface-variant">{c.label}</p>
                  <p className="truncate text-lg font-bold tracking-tight md:text-xl">{c.node}</p>
                  <p className="truncate text-[11px] text-on-surface-variant">{c.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Category + location */}
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-7">
              <Panel title="Spend by Category" icon="donut_large" iconClass="text-primary" className="h-full"
                action={
                  <div className="flex items-center gap-3">
                    {zelleCount > 0 && (
                      <button type="button" onClick={() => setCategory(category === P2P_CATEGORY ? null : P2P_CATEGORY)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${category === P2P_CATEGORY ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/50" : "bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"}`}>
                        <Icon name="currency_exchange" size={14} /> Venmo &amp; Zelle ({zelleCount})
                      </button>
                    )}
                    {category && <button type="button" onClick={() => setCategory(null)} className="text-xs font-semibold text-primary hover:underline">Clear</button>}
                  </div>
                }>
                {cats.length === 0 ? <EmptyState icon="donut_large" title="No spending in this period" /> : (
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 lg:grid-cols-2">
                    {cats.map((c) => {
                      const s = categoryStyle(c.category)
                      const sel = category === c.category
                      return (
                        <button key={c.category} type="button" onClick={() => setCategory(sel ? null : c.category)}
                          className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${sel ? "bg-surface-container-high ring-1 ring-indigo-brand/40" : "hover:bg-surface-container-high/50"}`}>
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.text}`}><Icon name={s.icon} size={16} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-2 text-xs">
                              <span className="truncate font-semibold">{c.category}</span>
                              <Money value={c.amount} className="font-semibold" />
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                              <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${c.pct}%` }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>
            <div className="col-span-12 xl:col-span-5">
              <Panel title="Spend by Location" icon="location_on" iconClass="text-fuchsia-300" className="h-full"
                action={
                  <div className="flex items-center gap-2">
                    {location && <button type="button" onClick={() => setLocation(null)} className="text-xs font-semibold text-primary hover:underline">Clear</button>}
                    <button type="button" onClick={() => setShowLocation((v) => !v)} aria-expanded={showLocation} aria-label="Toggle locations" className="text-on-surface-variant hover:text-on-surface">
                      <Icon name={showLocation ? "expand_less" : "expand_more"} />
                    </button>
                  </div>
                }>
                {!showLocation ? (
                  <p className="text-sm text-on-surface-variant">
                    {locations.length ? `${locations.length} places · top: ${locations[0][0]}` : "No location data for this period."}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {locations.map(([loc, amt]) => {
                      const sel = location === loc
                      return (
                        <button key={loc} type="button" onClick={() => setLocation(sel ? null : loc)}
                          className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left text-xs transition-colors ${sel ? "bg-surface-container-high ring-1 ring-fuchsia-400/40" : "hover:bg-surface-container-high/50"}`}>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-fuchsia-400" />
                          <span className="w-32 truncate">{loc}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                            <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${totalSpend ? (amt / totalSpend) * 100 : 0}%` }} />
                          </div>
                          <Money value={amt} className="w-20 text-right font-semibold" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {category === P2P_CATEGORY && <ZelleSummary transactions={periodTxns} />}

          {/* Table */}
          {/* listOpen: All / category / card / place / search picked */}
          <Panel
            padded={false}
            title={<div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Transactions</h2>{listOpen && <Badge>{filtered.length}</Badge>}</div>}
            action={
              <div className="flex items-center gap-2">
                {listOpen && (
                  <button type="button" onClick={collapse} aria-label="Collapse transaction list"
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-on-surface transition-colors hover:bg-white/[0.08]">
                    <Icon name="expand_less" size={16} /> Collapse
                  </button>
                )}
                {accountId && account && (
                  <button type="button" onClick={() => setAccountId(null)} aria-label="Clear account filter"
                    className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary">
                    {account.name} <Icon name="close" size={14} />
                  </button>
                )}
                {[
                  { v: category, clear: () => setCategory(null), cls: "bg-primary/10 text-primary" },
                  { v: location, clear: () => setLocation(null), cls: "bg-fuchsia-500/10 text-fuchsia-300" },
                ].map((f) => f.v && (
                  <button key={f.v} type="button" onClick={f.clear} aria-label={`Clear ${f.v} filter`}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${f.cls}`}>
                    {f.v} <Icon name="close" size={14} />
                  </button>
                ))}
                <label className="relative">
                  <span className="sr-only">Search transactions</span>
                  <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search merchant or category"
                    className="h-9 w-full rounded-full border border-white/10 bg-surface-container-lowest pr-3 pl-9 md:w-64 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25" />
                </label>
              </div>
            }
          >
            {!listOpen ? (
              <div className="flex flex-col gap-5 px-6 py-6">
                <button type="button" onClick={() => setShowAll(true)}
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
                  <span className="flex items-center gap-3">
                    <Icon name="receipt_long" size={20} className="text-primary" />
                    <span>
                      <span className="block text-sm font-semibold">All transactions</span>
                      <span className="text-xs text-on-surface-variant">{periodTxns.length} in this period</span>
                    </span>
                  </span>
                  <Icon name="chevron_right" className="text-on-surface-variant" />
                </button>
                {accounts.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">By card or account</p>
                    <div className="flex flex-wrap gap-2">
                      {ACCOUNT_TYPE_ORDER.flatMap((type) => accounts.filter((a) => a.type === type && a.type !== "investment")).map((a) => {
                        const n = transactions.filter((t) => t.account_id === a.id && inPeriod(spendDate(t))).length
                        if (!n) return null
                        return (
                          <button key={a.id} type="button" onClick={() => { setAccountId(a.id); setViewMode("month") }}
                            className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface-bright">
                            <Icon name={a.type === "credit" ? "credit_card" : "account_balance"} size={14} className="text-secondary" />
                            {a.name}{a.mask ? ` ••${a.mask}` : ""}
                            <span className="text-on-surface-variant">{n}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {cats.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">By category</p>
                    <div className="flex flex-wrap gap-2">
                      {cats.map((c) => {
                        const st = categoryStyle(c.category)
                        return (
                          <button key={c.category} type="button" onClick={() => setCategory(c.category)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${st.bg} ${st.text}`}>
                            <Icon name={st.icon} size={14} /> {c.category} <span className="opacity-70">{c.count}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : loading && !transactions.length ? (
              <p className="px-6 py-10 text-center text-sm text-on-surface-variant">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState icon="receipt_long" title="No transactions for this period" />
            ) : (
              <>
              {/* Phone: tappable list (tap → edit category / how it counts) */}
              <div className="divide-y divide-white/[0.04] md:hidden">
                {filtered.slice(0, 300).map((t) => (
                  <TransactionItem key={t.id} t={t} account={accountById.get(t.account_id)} showAccount={!accountId} />
                ))}
              </div>
              <div className="overflow-x-auto max-md:hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Merchant</th>
                      {!accountId && <th className="px-4 py-3 text-left">Account</th>}
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-left">Counts as</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(([type, list]) => (
                      <Fragment key={type || "all"}>
                        {type && (
                          <tr className="bg-surface-container-low/60">
                            <td colSpan={7} className="px-6 py-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{ACCOUNT_TYPE_LABELS[type]}</td>
                          </tr>
                        )}
                        {list.map((t) => {
                          const loc = formatLocation(t)
                          const s = categoryStyle(t.category)
                          const a = accountById.get(t.account_id)
                          return (
                            <tr key={t.id} className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-surface-container-high/40">
                              <td className="px-6 py-3 whitespace-nowrap text-on-surface-variant">{shortDate(t.date)}</td>
                              <td className="max-w-[260px] truncate px-4 py-3 font-semibold">
                                <button type="button" onClick={() => editTransaction(t)} className="max-w-full truncate text-left hover:underline">{t.merchant_name ?? t.description}</button>
                                {t.pending && <Badge tone="warning" className="ml-1.5 !px-1.5 !py-0 text-[9px]">Pending</Badge>}
                                {t.is_anomaly && <Icon name="gpp_maybe" size={14} className="ml-1.5 align-[-2px] text-amber-300" />}
                              </td>
                              {!accountId && <td className="max-w-[160px] truncate px-4 py-3 text-on-surface-variant">{a?.name ?? "—"}</td>}
                              <td className="px-4 py-3">
                                {t.category ? (
                                  <button type="button" onClick={() => setCategory(category === t.category ? null : t.category)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors ${category === t.category ? "bg-surface-container-highest" : "hover:bg-surface-container-high"}`}>
                                    <Icon name={s.icon} size={14} className={s.text} />{t.category}
                                  </button>
                                ) : <span className="text-xs text-on-surface-variant">Uncategorized</span>}
                              </td>
                              <td className="px-4 py-3">
                                {loc ? (
                                  <button type="button" onClick={() => { setLocation(location === loc ? null : loc); setShowLocation(true) }}
                                    className="rounded-full px-2 py-0.5 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">{loc}</button>
                                ) : <span className="text-on-surface-variant/50">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => editTransaction(t)} title="Change how this counts"
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 ${isMatchedRefund(t) ? "bg-amber-500/10 text-amber-300" : FLOW_PILL[flowOf(t)]}`}>
                                  {flowLabel(t)}{t.reimburses && ` · ${t.reimburses.merchant.slice(0, 16)}`}{t.flow_override && !isMatchedRefund(t) && t.category_source !== "reimb_match" && <Icon name="edit" size={11} />}
                                </button>
                              </td>
                              <td className={`px-6 py-3 text-right font-semibold ${t.amount < 0 ? "text-tertiary" : ""}`}>
                                <Money value={-t.amount} sign />
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={collapse}
                className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-3 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-white/[0.03] hover:text-on-surface">
                <Icon name="expand_less" size={18} /> Collapse list · {filtered.length} transactions
              </button>
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
