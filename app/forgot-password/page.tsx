"use client"

import Link from "next/link"
import { useState } from "react"
import { AuthShell, AUTH_INPUT, Field } from "@/components/auth/AuthShell"

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier }) })
    setBusy(false)
    if (res.ok) setSent(true)
    else setError((await res.json().catch(() => ({}))).error ?? "Something went wrong")
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="glass-raised flex flex-col gap-4 rounded-2xl p-6 md:p-8">
        <div>
          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="text-sm text-on-surface-variant">We&apos;ll email you a link to choose a new one.</p>
        </div>
        {sent ? (
          <p className="rounded-lg bg-tertiary/10 px-3 py-2 text-sm text-tertiary">If an account exists for that email or username, a reset link is on its way. Open it on this device.</p>
        ) : (
          <>
            <Field label="Email or username">
              <input className={`${AUTH_INPUT} border-white/10`} autoFocus autoCapitalize="none" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </Field>
            {error && <p className="rounded-lg bg-error-container/30 px-3 py-2 text-xs text-error">{error}</p>}
            <button type="submit" disabled={busy || !identifier}
              className="h-11 rounded-full bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <p className="text-center text-xs text-on-surface-variant"><Link href="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link></p>
      </form>
    </AuthShell>
  )
}
