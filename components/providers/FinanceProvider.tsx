"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import type { Account, CreditLiability, Transaction } from "@/lib/types"
import { Icon } from "@/components/ui/Icon"

/* ------------------------------------------------------------------ */
/* Privacy mode (persisted in localStorage, SSR-safe)                  */
/* ------------------------------------------------------------------ */

const PRIVACY_KEY = "vertice:hide-balances"
const privacyListeners = new Set<() => void>()

function subscribePrivacy(cb: () => void) {
  privacyListeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    privacyListeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}
const getPrivacy = () => localStorage.getItem(PRIVACY_KEY) === "1"
const getPrivacyServer = () => false

function setPrivacy(hidden: boolean) {
  localStorage.setItem(PRIVACY_KEY, hidden ? "1" : "0")
  privacyListeners.forEach((l) => l())
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

type ToastTone = "success" | "error" | "info"
interface Toast { id: number; message: string; tone: ToastTone }

interface FinanceContextValue {
  accounts: Account[]
  transactions: Transaction[]
  liabilities: CreditLiability[]
  loading: boolean
  error: string | null
  hasData: boolean
  lastUpdated: Date | null
  refresh: () => Promise<void>
  /** Pull new transactions from Plaid, then AI-categorize them. */
  syncAndCategorize: () => Promise<void>
  syncing: string | null
  /** Re-apply rules / Plaid / AI to everything not edited by hand (chunked, resumable) */
  recategorizeAll: () => Promise<void>
  sendDigest: () => Promise<void>
  sendingDigest: boolean
  hidden: boolean
  toggleHidden: () => void
  notify: (message: string, tone?: ToastTone) => void
  /** Optimistically patch a transaction in local state */
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  /** Transaction open in the edit dialog */
  editing: Transaction | null
  editTransaction: (t: Transaction | null) => void
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

export function useFinance() {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error("useFinance must be used inside <FinanceProvider>")
  return ctx
}

/** Privacy flag only — cheap for <Money/> to consume. */
export function useHidden() {
  return useSyncExternalStore(subscribePrivacy, getPrivacy, getPrivacyServer)
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    const msg = typeof data.error === "string" ? data.error : data.error?.error_message ?? `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [liabilities, setLiabilities] = useState<CreditLiability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [sendingDigest, setSendingDigest] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const lastLoadAt = useRef(0)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const hidden = useHidden()

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const load = useCallback(async () => {
    try {
      const [a, t, l] = await Promise.all([
        getJson<{ accounts: Account[] }>("/api/accounts"),
        getJson<{ transactions: Transaction[] }>("/api/transactions"),
        getJson<{ credit: CreditLiability[] }>("/api/liabilities").catch(() => ({ credit: [] })),
      ])
      setAccounts(a.accounts ?? [])
      setTransactions(t.transactions ?? [])
      setLiabilities(l.credit ?? [])
      setError(null)
      setLastUpdated(new Date())
      lastLoadAt.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch; state is set after await
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    setLoading(true)
    await load()
  }, [load])

  // Pick up changes made by webhooks / cron while the tab was in the background
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return
      if (lastLoadAt.current && Date.now() - lastLoadAt.current < 60_000) return
      void load()
    }
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
  }, [load])

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setTransactions((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  /** Runs time-boxed categorization chunks until nothing is left (each server call is ~40s max). */
  const runCategorization = useCallback(async (mode: "uncategorized" | "all") => {
    let since: string | undefined
    let total = 0
    let llm = 0
    for (let i = 0; i < 50; i++) {
      const r = await getJson<{ categorized: number; llmUsed: number; remaining: number; since: string }>("/api/ai/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, since }),
      })
      since = r.since
      total += r.categorized
      llm += r.llmUsed
      if (r.remaining === 0 || r.categorized === 0) break
      setSyncing(`Categorizing… ${r.remaining} left`)
    }
    return { categorized: total, llmUsed: llm }
  }, [])

  const syncAndCategorize = useCallback(async () => {
    try {
      setSyncing("Syncing with your banks…")
      const sync = await getJson<{ synced: number; removed: number; categorized: number; llmUsed: number; remaining: number; warning?: string }>("/api/plaid/sync", { method: "POST" })
      let { categorized, llmUsed } = sync
      if (sync.remaining > 0) {
        setSyncing(`Categorizing… ${sync.remaining} left`)
        const more = await runCategorization("uncategorized")
        categorized += more.categorized
        llmUsed += more.llmUsed
      }
      await load()
      const ai = llmUsed ? ` (${llmUsed} needed AI)` : ""
      notify(
        sync.synced || sync.removed || categorized
          ? `${sync.synced} new/updated · ${sync.removed} removed · ${categorized} categorized${ai}`
          : "Already up to date"
      )
      if (sync.warning) notify(sync.warning, "error")
    } catch (e) {
      notify(e instanceof Error ? e.message : "Sync failed", "error")
    } finally {
      setSyncing(null)
    }
  }, [load, notify, runCategorization])

  const recategorizeAll = useCallback(async () => {
    try {
      setSyncing("Re-categorizing…")
      const r = await runCategorization("all")
      await load()
      notify(`Re-categorized ${r.categorized} transactions · ${r.llmUsed} needed AI`)
    } catch (e) {
      notify(e instanceof Error ? e.message : "Re-categorize failed", "error")
    } finally {
      setSyncing(null)
    }
  }, [load, notify, runCategorization])

  const sendDigest = useCallback(async () => {
    setSendingDigest(true)
    try {
      await getJson("/api/digest", { method: "POST" })
      notify("Weekly digest sent by SMS")
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to send digest", "error")
    } finally {
      setSendingDigest(false)
    }
  }, [notify])

  const value = useMemo<FinanceContextValue>(
    () => ({
      accounts, transactions, liabilities, loading, error, lastUpdated,
      hasData: accounts.length > 0,
      refresh, syncAndCategorize, syncing, recategorizeAll, sendDigest, sendingDigest,
      hidden, toggleHidden: () => setPrivacy(!hidden), notify,
      updateTransaction, editing, editTransaction: setEditing,
    }),
    [accounts, transactions, liabilities, loading, error, lastUpdated, refresh, syncAndCategorize, syncing, recategorizeAll, sendDigest, sendingDigest, hidden, notify, updateTransaction, editing]
  )

  return (
    <FinanceContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="glass-raised flex animate-pop-in items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          >
            <Icon
              name={t.tone === "error" ? "error" : t.tone === "info" ? "info" : "check_circle"}
              size={18}
              className={t.tone === "error" ? "text-error" : t.tone === "info" ? "text-secondary" : "text-tertiary"}
            />
            {t.message}
          </div>
        ))}
      </div>
    </FinanceContext.Provider>
  )
}
