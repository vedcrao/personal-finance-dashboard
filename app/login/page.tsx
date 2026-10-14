"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Icon } from "@/components/ui/Icon"

function LoginForm() {
  const next = useSearchParams().get("next") ?? "/"
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })
    if (res.ok) {
      // Only allow same-site relative redirects
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/"
    } else {
      setError("Wrong password")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass-raised flex w-full max-w-sm flex-col gap-4 rounded-2xl p-8">
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-brand to-secondary-container glow-primary">
          <Icon name="change_history" size={22} filled className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">Vertice</span>
      </div>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="h-11 rounded-lg border border-white/10 bg-surface-container-lowest px-3 text-sm outline-none focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"
      />
      {error && <p className="text-xs text-error">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="h-11 rounded-full bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
