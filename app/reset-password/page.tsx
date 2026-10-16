"use client"

import { useState } from "react"
import { AuthShell, AUTH_INPUT, Field } from "@/components/auth/AuthShell"

/** Reached from the email link (auth/callback signs you in first). */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError("Passwords don't match")
    setBusy(true)
    setError(null)
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })
    if (res.ok) window.location.href = "/"
    else {
      setError(res.status === 401 ? "This reset link expired. Request a new one." : (await res.json().catch(() => ({}))).error ?? "Couldn't update password")
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="glass-raised flex flex-col gap-4 rounded-2xl p-6 md:p-8">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <Field label="New password" hint="At least 8 characters">
          <input className={`${AUTH_INPUT} border-white/10`} type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input className={`${AUTH_INPUT} border-white/10`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-error-container/30 px-3 py-2 text-xs text-error">{error}</p>}
        <button type="submit" disabled={busy || password.length < 8}
          className="h-11 rounded-full bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50">
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  )
}
