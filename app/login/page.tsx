"use client"

import Link from "next/link"
import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AuthShell, AUTH_INPUT, Field } from "@/components/auth/AuthShell"

function LoginForm() {
  const params = useSearchParams()
  const next = params.get("next") ?? "/"
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? "That confirmation link is invalid or expired. Try logging in." : null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/"
    } else {
      setError(data.error ?? "Couldn't sign in")
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="glass-raised flex flex-col gap-4 rounded-2xl p-6 md:p-8">
        <div>
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="text-sm text-on-surface-variant">Sign in with your email or username.</p>
        </div>
        <Field label="Email or username">
          <input className={`${AUTH_INPUT} border-white/10`} autoFocus autoComplete="username" autoCapitalize="none" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className={`${AUTH_INPUT} border-white/10`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-error-container/30 px-3 py-2 text-xs text-error">{error}</p>}
        <button type="submit" disabled={busy || !identifier || !password}
          className="h-11 rounded-full bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-on-surface-variant">
          New here? <Link href="/signup" className="font-semibold text-primary hover:underline">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
