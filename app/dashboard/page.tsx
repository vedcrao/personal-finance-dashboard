"use client"

import React, { useEffect, useState } from "react"

interface Transaction {
  id: string
  account_id: string
  amount: number
  merchant_name: string | null
  description: string
  date: string
  category: string | null
  is_anomaly: boolean
  city: string | null
  region: string | null
  country: string | null
}

interface Account {
  id: string
  name: string
  type: string
  subtype: string | null
  mask: string | null
  institution_name: string
  plaid_item_id: string
  billing_cycle_day: number | null
}

interface RecurringItem {
  merchant: string
  avgAmount: number
  frequency: string
  monthlyCost: number
  count: number
  lastDate: string
  category: string | null
}

const EXCLUDED_KEYWORDS = ["payment", "transfer", "autopay", "credit card", "ach pmt", "des:ach", "online pmt", "bill pay"]

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining": "bg-orange-500",
  "Groceries": "bg-lime-500",
  "Shopping": "bg-rose-500",
  "Entertainment": "bg-purple-500",
  "Travel": "bg-blue-500",
  "Transport": "bg-sky-500",
  "Subscriptions": "bg-violet-500",
  "Healthcare": "bg-emerald-500",
  "Utilities": "bg-amber-500",
  "Rent": "bg-red-400",
  "Income": "bg-green-500",
  "Other": "bg-slate-400",
  "Uncategorized": "bg-slate-300",
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  credit: "Credit Cards",
  depository: "Bank Accounts",
  investment: "Investments",
  loan: "Loans",
  other: "Other",
}

const ACCOUNT_TYPE_ORDER = ["credit", "depository", "investment", "loan", "other"]

function getRecentMonths(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return { label: d.toLocaleDateString("en-US", { month: "long" }), value: d.toISOString().slice(0, 7) }
  })
}

const MONTHS = getRecentMonths(3)
const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

function getBillingPeriods(day: number) {
  const now = new Date()
  return Array.from({ length: 3 }, (_, i) => {
    const close = new Date(now.getFullYear(), now.getMonth() - (2 - i), day)
    const open = new Date(close.getFullYear(), close.getMonth() - 1, day + 1)
    return {
      label: close.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: open.toISOString().split("T")[0],
      end: close.toISOString().split("T")[0],
    }
  })
}

function formatLocation(t: Transaction): string | null {
  if (t.city && t.region) return `${t.city}, ${t.region}`
  if (t.city && t.country) return `${t.city}, ${t.country}`
  if (t.city) return t.city
  if (t.country && t.country !== "US") return t.country
  return null
}

function detectRecurring(txns: Transaction[]): RecurringItem[] {
  const candidates = txns.filter(
    (t) => t.amount > 0 && !EXCLUDED_KEYWORDS.some((k) => t.description.toLowerCase().includes(k))
  )
  const byMerchant: Record<string, Transaction[]> = {}
  for (const t of candidates) {
    const key = (t.merchant_name || t.description).trim()
    if (!byMerchant[key]) byMerchant[key] = []
    byMerchant[key].push(t)
  }

  const results: RecurringItem[] = []
  for (const [merchant, group] of Object.entries(byMerchant)) {
    if (group.length < 2) continue
    const months = new Set(group.map((t) => t.date.slice(0, 7)))
    if (months.size < 2) continue
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = sorted.map((t) => t.amount)
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length
    const maxDev = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg))
    if (maxDev > 0.15) continue

    const intervals = sorted.slice(1).map((t, i) => {
      const d1 = new Date(sorted[i].date), d2 = new Date(t.date)
      return (d2.getTime() - d1.getTime()) / 86400000
    })
    const avgInterval = intervals.reduce((s, d) => s + d, 0) / intervals.length

    let frequency = "Monthly"
    let monthlyCost = avg
    if (avgInterval <= 10) { frequency = "Weekly"; monthlyCost = avg * 4.33 }
    else if (avgInterval <= 18) { frequency = "Bi-weekly"; monthlyCost = avg * 2.17 }
    else if (avgInterval > 80) { frequency = "Quarterly"; monthlyCost = avg / 3 }

    results.push({ merchant, avgAmount: avg, frequency, monthlyCost, count: group.length, lastDate: sorted[sorted.length - 1].date, category: group[0].category })
  }
  return results.sort((a, b) => b.avgAmount - a.avgAmount)
}

function CategoryDot({ category }: { category: string | null }) {
  const color = CATEGORY_COLORS[category ?? "Uncategorized"] ?? "bg-slate-300"
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [mainTab, setMainTab] = useState<"overview" | "subscriptions">("overview")
  const [viewMode, setViewMode] = useState<"month" | "statement">("month")
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [selectedStatementIdx, setSelectedStatementIdx] = useState(2)
  const [showLocation, setShowLocation] = useState(false)
  const [editingBillingDay, setEditingBillingDay] = useState<string | null>(null)
  const [billingDayInput, setBillingDayInput] = useState("")
  const [billingDayError, setBillingDayError] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [digestMsg, setDigestMsg] = useState<string | null>(null)

  async function fetchTransactions(accountId: string | null) {
    setLoading(true)
    setSelectedCategory(null)
    setSelectedLocation(null)
    const url = accountId ? `/api/transactions?account_id=${accountId}` : "/api/transactions"
    const res = await fetch(url)
    const data = await res.json()
    setTransactions(data.transactions ?? [])
    setLoading(false)
  }

  async function fetchAccounts() {
    const res = await fetch("/api/accounts")
    const data = await res.json()
    setAccounts(data.accounts ?? [])
  }

  useEffect(() => { fetchAccounts(); fetchTransactions(null) }, [])

  async function selectAccount(id: string | null) {
    setSelectedAccountId(id)
    setViewMode("month")
    setMainTab("overview")
    await fetchTransactions(id)
  }

  async function saveBillingDay(accountId: string) {
    const day = parseInt(billingDayInput)
    if (isNaN(day) || day < 1 || day > 31) { setBillingDayError("Enter a day 1–31"); return }
    setBillingDayError("")
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_cycle_day: day }),
    })
    if (!res.ok) { const d = await res.json(); setBillingDayError(d.error ?? "Save failed"); return }
    setEditingBillingDay(null)
    setBillingDayInput("")
    await fetchAccounts()
  }

  async function sendDigest() {
    setSending(true)
    const res = await fetch("/api/digest", { method: "POST" })
    const data = await res.json()
    setDigestMsg(data.error ? `Error: ${data.error}` : "SMS sent!")
    setSending(false)
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const billingPeriods = selectedAccount?.billing_cycle_day ? getBillingPeriods(selectedAccount.billing_cycle_day) : []
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  function isInRange(date: string) {
    if (viewMode === "month") return date.startsWith(selectedMonth)
    if (viewMode === "statement" && billingPeriods[selectedStatementIdx]) {
      const { start, end } = billingPeriods[selectedStatementIdx]
      return date >= start && date <= end
    }
    return false
  }

  const spendTxns = transactions.filter(
    (t) => isInRange(t.date) && t.amount > 0 && !EXCLUDED_KEYWORDS.some((k) => t.description.toLowerCase().includes(k))
  )
  const totalSpend = spendTxns.reduce((s, t) => s + t.amount, 0)

  const now = new Date()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projectedSpend = viewMode === "month" && selectedMonth === CURRENT_MONTH
    ? (totalSpend / dayOfMonth) * daysInMonth : null

  const categoryBreakdown = spendTxns.reduce<Record<string, number>>((acc, t) => {
    const cat = t.category ?? "Uncategorized"
    acc[cat] = (acc[cat] ?? 0) + t.amount
    return acc
  }, {})
  const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]

  const locationBreakdown = transactions
    .filter((t) => t.amount > 0 && isInRange(t.date))
    .reduce<Record<string, number>>((acc, t) => {
      const loc = formatLocation(t)
      if (loc) acc[loc] = (acc[loc] ?? 0) + t.amount
      return acc
    }, {})

  const filteredTxns = transactions.filter((t) => {
    if (!isInRange(t.date)) return false
    if (selectedCategory && t.category !== selectedCategory) return false
    if (selectedLocation && formatLocation(t) !== selectedLocation) return false
    return true
  })

  const recurring = detectRecurring(transactions)
  const monthlySubTotal = recurring.reduce((s, r) => s + r.monthlyCost, 0)

  // Group accounts by type for sidebar
  const accountsByType = ACCOUNT_TYPE_ORDER.reduce<Record<string, Account[]>>((acc, type) => {
    const group = accounts.filter((a) => a.type === type)
    if (group.length) acc[type] = group
    return acc
  }, {})

  // Group transactions by account type for All Accounts view
  const txnsByType = ACCOUNT_TYPE_ORDER.reduce<Record<string, Transaction[]>>((acc, type) => {
    const group = filteredTxns.filter((t) => accountById.get(t.account_id)?.type === type)
    if (group.length) acc[type] = group
    return acc
  }, {})

  const pageTitle = selectedAccount?.name ?? "All Accounts"

  return (
    <div className="flex h-screen bg-[#f5f5f7] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-56 bg-[#111111] flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <span className="text-white font-semibold text-sm">Finance</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
          <button
            onClick={() => selectAccount(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedAccountId === null ? "bg-white/10 text-white font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
          >
            All Accounts
          </button>

          {Object.entries(accountsByType).map(([type, accs]) => (
            <div key={type} className="mt-3">
              <p className="px-3 py-1 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                {ACCOUNT_TYPE_LABELS[type]}
              </p>
              {accs.map((account) => (
                <div key={account.id}>
                  <button
                    onClick={() => selectAccount(account.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedAccountId === account.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <div className="text-xs font-medium leading-tight truncate">{account.name}</div>
                    {account.mask && <div className="text-[10px] opacity-60 mt-0.5">••{account.mask}</div>}
                  </button>

                  {account.type === "credit" && selectedAccountId === account.id && (
                    <div className="mx-3 mb-1 px-2 py-2 bg-white/5 rounded-lg">
                      {editingBillingDay === account.id ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500 text-[10px]">Closes day</span>
                            <input
                              type="number" min={1} max={31}
                              value={billingDayInput}
                              onChange={(e) => { setBillingDayInput(e.target.value); setBillingDayError("") }}
                              onKeyDown={(e) => e.key === "Enter" && saveBillingDay(account.id)}
                              className="w-12 bg-white/10 border border-white/10 text-white rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-indigo-500"
                              placeholder="14"
                              autoFocus
                            />
                            <button onClick={() => saveBillingDay(account.id)} className="text-indigo-400 text-[10px] font-medium">Save</button>
                            <button onClick={() => { setEditingBillingDay(null); setBillingDayError("") }} className="text-slate-600 text-[10px]">✕</button>
                          </div>
                          {billingDayError && <p className="text-red-400 text-[10px]">{billingDayError}</p>}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingBillingDay(account.id); setBillingDayInput(String(account.billing_cycle_day ?? "")); setBillingDayError("") }}
                          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors text-left"
                        >
                          {account.billing_cycle_day ? `Statement closes day ${account.billing_cycle_day}` : "Set closing date"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-white/8">
          <button
            onClick={sendDigest}
            disabled={sending}
            className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors py-1.5 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send SMS Digest"}
          </button>
          {digestMsg && <p className="text-[10px] text-slate-600 text-center mt-1">{digestMsg}</p>}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#f5f5f7]/80 backdrop-blur border-b border-black/5 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">{pageTitle}</h1>
            {selectedAccount && (
              <p className="text-xs text-gray-400">{selectedAccount.institution_name} · {ACCOUNT_TYPE_LABELS[selectedAccount.type]}</p>
            )}
          </div>
          {/* Main tabs */}
          <div className="flex gap-1 bg-black/5 p-1 rounded-lg">
            <button
              onClick={() => setMainTab("overview")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === "overview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Overview
            </button>
            <button
              onClick={() => setMainTab("subscriptions")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === "subscriptions" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Recurring
              {recurring.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-semibold">{recurring.length}</span>
              )}
            </button>
          </div>
        </div>

        <div className="px-8 py-6">
          {mainTab === "overview" && (
            <>
              {/* Period selector */}
              <div className="flex items-center gap-2 mb-6">
                <div className="flex gap-1 bg-black/5 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode("month")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "month" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    Month
                  </button>
                  {selectedAccount?.type === "credit" && selectedAccount.billing_cycle_day && (
                    <button
                      onClick={() => setViewMode("statement")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "statement" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      Statement
                    </button>
                  )}
                </div>

                <div className="flex gap-1">
                  {viewMode === "month" && MONTHS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setSelectedMonth(m.value)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedMonth === m.value ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                  {viewMode === "statement" && billingPeriods.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedStatementIdx(i)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors leading-tight text-left ${selectedStatementIdx === i ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}
                    >
                      <div>{p.label}</div>
                      <div className="opacity-70 font-normal">{p.start.slice(5)} → {p.end.slice(5)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: viewMode === "statement" ? "Statement Spend" : "Total Spend", value: `$${totalSpend.toFixed(2)}` },
                  projectedSpend !== null
                    ? { label: "Projected Month", value: `$${projectedSpend.toFixed(2)}`, sub: "based on daily avg" }
                    : { label: "Transactions", value: `${spendTxns.length}`, sub: "spending transactions" },
                  { label: "Top Category", value: topCategory?.[0] ?? "—", sub: topCategory ? `$${topCategory[1].toFixed(2)}` : undefined },
                ].map((card) => (
                  <div key={card.label} className="bg-white border border-gray-100 rounded-2xl p-5">
                    <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900 truncate">{card.value}</p>
                    {card.sub && <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>}
                  </div>
                ))}
              </div>

              {/* Category + Location */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Category breakdown */}
                {Object.keys(categoryBreakdown).length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold text-gray-900">Spend by Category</h2>
                      {selectedCategory && (
                        <button onClick={() => setSelectedCategory(null)} className="text-xs text-indigo-600 hover:underline">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {Object.entries(categoryBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, amt]) => {
                          const pct = totalSpend > 0 ? (amt / totalSpend) * 100 : 0
                          const isSelected = selectedCategory === cat
                          const color = CATEGORY_COLORS[cat] ?? "bg-slate-400"
                          return (
                            <button
                              key={cat}
                              onClick={() => setSelectedCategory(isSelected ? null : cat)}
                              className={`flex items-center gap-3 w-full text-left rounded-xl px-2 py-1.5 transition-colors ${isSelected ? "bg-gray-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"}`}
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                              <span className="text-xs text-gray-600 w-28 truncate">{cat}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-gray-900 w-16 text-right">${amt.toFixed(2)}</span>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Location breakdown (collapsible) */}
                {Object.keys(locationBreakdown).length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-2xl p-5">
                    <button
                      onClick={() => setShowLocation((v) => !v)}
                      className="flex items-center justify-between w-full"
                    >
                      <h2 className="text-sm font-semibold text-gray-900">Spend by Location</h2>
                      <span className="text-gray-300 text-xs">{showLocation ? "▲" : "▼"}</span>
                    </button>
                    {showLocation && (
                      <div className="flex flex-col gap-2.5 mt-4">
                        {selectedLocation && (
                          <div className="flex justify-end">
                            <button onClick={() => setSelectedLocation(null)} className="text-xs text-indigo-600 hover:underline">Clear</button>
                          </div>
                        )}
                        {Object.entries(locationBreakdown)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 8)
                          .map(([loc, amt]) => {
                            const pct = totalSpend > 0 ? (amt / totalSpend) * 100 : 0
                            const isSelected = selectedLocation === loc
                            return (
                              <button
                                key={loc}
                                onClick={() => setSelectedLocation(isSelected ? null : loc)}
                                className={`flex items-center gap-3 w-full text-left rounded-xl px-2 py-1.5 transition-colors ${isSelected ? "bg-gray-50 ring-1 ring-violet-200" : "hover:bg-gray-50"}`}
                              >
                                <span className="w-2 h-2 rounded-full shrink-0 bg-violet-500" />
                                <span className="text-xs text-gray-600 w-28 truncate">{loc}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-medium text-gray-900 w-16 text-right">${amt.toFixed(2)}</span>
                              </button>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Active filters */}
              {(selectedCategory || selectedLocation) && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-400">Filtering:</span>
                  {selectedCategory && (
                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                      <CategoryDot category={selectedCategory} />
                      {selectedCategory}
                      <button onClick={() => setSelectedCategory(null)} className="ml-1 hover:text-indigo-900">×</button>
                    </span>
                  )}
                  {selectedLocation && (
                    <span className="flex items-center gap-1 bg-violet-50 text-violet-700 text-xs px-2.5 py-1 rounded-full">
                      {selectedLocation}
                      <button onClick={() => setSelectedLocation(null)} className="ml-1 hover:text-violet-900">×</button>
                    </span>
                  )}
                </div>
              )}

              {/* Transactions table */}
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
                  <span className="text-xs text-gray-400">{filteredTxns.length} transactions</span>
                </div>
                {loading ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</p>
                ) : filteredTxns.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No transactions for this period</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Merchant</th>
                        {selectedAccountId === null && (
                          <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Account</th>
                        )}
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAccountId === null ? (
                        Object.entries(txnsByType).map(([type, txns]) => (
                          <React.Fragment key={type}>
                            <tr className="bg-gray-50/60">
                              <td colSpan={6} className="px-5 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                                {ACCOUNT_TYPE_LABELS[type]}
                              </td>
                            </tr>
                            {txns.map((t) => (
                              <TransactionRow
                                key={t.id}
                                t={t}
                                accountName={accountById.get(t.account_id)?.name}
                                showAccount={true}
                                selectedCategory={selectedCategory}
                                selectedLocation={selectedLocation}
                                onCategoryClick={(cat) => setSelectedCategory(selectedCategory === cat ? null : cat)}
                                onLocationClick={(loc) => setSelectedLocation(selectedLocation === loc ? null : loc)}
                              />
                            ))}
                          </React.Fragment>
                        ))
                      ) : (
                        filteredTxns.map((t) => (
                          <TransactionRow
                            key={t.id}
                            t={t}
                            showAccount={false}
                            selectedCategory={selectedCategory}
                            selectedLocation={selectedLocation}
                            onCategoryClick={(cat) => setSelectedCategory(selectedCategory === cat ? null : cat)}
                            onLocationClick={(loc) => setSelectedLocation(selectedLocation === loc ? null : loc)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Subscriptions tab */}
          {mainTab === "subscriptions" && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                  <p className="text-xs text-gray-400 mb-1">Est. Monthly Cost</p>
                  <p className="text-2xl font-bold text-gray-900">${monthlySubTotal.toFixed(2)}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                  <p className="text-xs text-gray-400 mb-1">Recurring Charges</p>
                  <p className="text-2xl font-bold text-gray-900">{recurring.length}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-5">
                  <p className="text-xs text-gray-400 mb-1">Annual Estimate</p>
                  <p className="text-2xl font-bold text-gray-900">${(monthlySubTotal * 12).toFixed(0)}</p>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Detected Recurring Charges</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Merchants that appear consistently across multiple months</p>
                </div>
                {recurring.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No recurring charges detected yet — sync more months of data</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-50">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Merchant</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Frequency</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Last Charge</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Avg / mo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recurring.map((r) => (
                        <tr key={r.merchant} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">{r.merchant}</td>
                          <td className="px-4 py-3">
                            {r.category ? (
                              <span className="flex items-center gap-1.5">
                                <CategoryDot category={r.category} />
                                <span className="text-gray-600">{r.category}</span>
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              r.frequency === "Weekly" ? "bg-orange-50 text-orange-600" :
                              r.frequency === "Bi-weekly" ? "bg-amber-50 text-amber-600" :
                              r.frequency === "Quarterly" ? "bg-blue-50 text-blue-600" :
                              "bg-violet-50 text-violet-600"
                            }`}>
                              {r.frequency}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{r.lastDate}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">${r.monthlyCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function TransactionRow({
  t, accountName, showAccount, selectedCategory, selectedLocation, onCategoryClick, onLocationClick,
}: {
  t: Transaction
  accountName?: string
  showAccount: boolean
  selectedCategory: string | null
  selectedLocation: string | null
  onCategoryClick: (cat: string) => void
  onLocationClick: (loc: string) => void
}) {
  const location = formatLocation(t)
  return (
    <tr className="hover:bg-gray-50/60 transition-colors border-b border-gray-50 last:border-0">
      <td className="px-5 py-3 text-gray-400">{t.date}</td>
      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">{t.merchant_name ?? t.description}</td>
      {showAccount && (
        <td className="px-4 py-3 text-gray-400 truncate max-w-[120px]">{accountName ?? "—"}</td>
      )}
      <td className="px-4 py-3">
        {t.category ? (
          <button
            onClick={() => onCategoryClick(t.category!)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-colors ${selectedCategory === t.category ? "bg-gray-200 text-gray-900" : "hover:bg-gray-100 text-gray-600"}`}
          >
            <CategoryDot category={t.category} />
            {t.category}
          </button>
        ) : <span className="text-gray-200">—</span>}
      </td>
      <td className="px-4 py-3">
        {location ? (
          <button
            onClick={() => onLocationClick(location)}
            className={`px-2 py-0.5 rounded-full transition-colors ${selectedLocation === location ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:bg-gray-100"}`}
          >
            {location}
          </button>
        ) : <span className="text-gray-200">—</span>}
      </td>
      <td className={`px-5 py-3 text-right font-semibold ${t.amount < 0 ? "text-emerald-600" : "text-gray-900"}`}>
        {t.amount < 0 ? `+$${Math.abs(t.amount).toFixed(2)}` : `$${t.amount.toFixed(2)}`}
      </td>
    </tr>
  )
}
