"use client"

import PlaidLink from "@/components/PlaidLink"
import Link from "next/link"
import { useState } from "react"

export default function Home() {
  const [syncing, setSyncing] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function syncAndCategorize() {
    setSyncing(true)
    setMessage("Syncing transactions…")
    const syncRes = await fetch("/api/plaid/sync", { method: "POST" })
    const syncData = await syncRes.json()
    if (syncData.error) {
      setMessage(`Sync error: ${syncData.error}`)
      setSyncing(false)
      return
    }
    setSyncing(false)
    setCategorizing(true)
    setMessage(`Synced ${syncData.synced} transactions. Categorizing with AI…`)
    const catRes = await fetch("/api/ai/categorize", { method: "POST" })
    const catData = await catRes.json()
    if (catData.error) {
      setMessage(`Categorize error: ${catData.error}`)
    } else {
      setMessage(`Done — ${syncData.synced} transactions synced, ${catData.categorized} categorized.`)
      setReady(true)
    }
    setCategorizing(false)
  }

  const busy = syncing || categorizing

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center mb-2">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Finance Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Set up your accounts to get started</p>
        </div>

        <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Step 1 — Connect Banks</p>
          <PlaidLink />
        </div>

        <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Step 2 — Sync & Categorize</p>
          <button
            onClick={syncAndCategorize}
            disabled={busy}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            {syncing ? "Syncing…" : categorizing ? "Categorizing with AI…" : "Sync & Categorize Transactions"}
          </button>
          {message && <p className="text-slate-400 text-xs leading-relaxed">{message}</p>}
        </div>

        {ready ? (
          <Link
            href="/dashboard"
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-3 rounded-xl transition-colors text-sm text-center"
          >
            Go to Dashboard →
          </Link>
        ) : (
          <Link href="/dashboard" className="text-center text-slate-600 hover:text-slate-400 text-xs transition-colors">
            Already set up? Open dashboard
          </Link>
        )}
      </div>
    </main>
  )
}
