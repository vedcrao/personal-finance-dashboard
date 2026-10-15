"use client"

import Link from "next/link"
import { useState } from "react"
import { AuthShell, AUTH_INPUT, Field } from "@/components/auth/AuthShell"
import { Icon } from "@/components/ui/Icon"

type Fields = "username" | "email" | "password" | "plaid_client_id" | "plaid_secret"

const STEPS = [
  {
    title: "Create a free Plaid developer account",
    body: <>Sign up at <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">dashboard.plaid.com/signup</a>. It&apos;s free; you&apos;re the &quot;developer&quot; for your own data.</>,
  },
  {
    title: "Open Developers → Keys",
    body: <>Go to <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">dashboard.plaid.com/developers/keys</a> and copy your <b>client_id</b>.</>,
  },
  {
    title: "Copy the secret for your environment",
    body: <><b>Sandbox</b> works instantly with fake test banks (log in with <code className="text-on-surface">user_good</code> / <code className="text-on-surface">pass_good</code>). <b>Production</b> connects your real banks once Plaid approves your production access request in the dashboard.</>,
  },
  {
    title: "Paste both here",
    body: <>We check the keys with Plaid before creating your account. The secret is encrypted before it&apos;s stored and never shown again.</>,
  },
]

export default function SignupPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", plaid_client_id: "", plaid_secret: "", plaid_env: "sandbox" })
  const [errors, setErrors] = useState<Partial<Record<Fields | "form", string>>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | "confirm_email">(null)
  const [showSecret, setShowSecret] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }))
  }
  const border = (k: Fields) => (errors[k] ? "border-error/60" : "border-white/10")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setErrors(data.field ? { [data.field]: data.error } : { form: data.error ?? "Sign up failed" })
    if (data.status === "signed_in") window.location.href = "/connect"
    else setDone("confirm_email")
  }

  if (done) {
    return (
      <AuthShell>
        <div className="glass-raised flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary/10 text-tertiary"><Icon name="mark_email_read" size={26} /></div>
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-on-surface-variant">We sent a confirmation link to <b className="text-on-surface">{form.email}</b>. Open it to finish, then connect your banks.</p>
          <Link href="/login" className="mt-2 text-sm font-semibold text-primary hover:underline">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <form onSubmit={submit} className="glass-raised flex flex-col gap-4 rounded-2xl p-6 md:p-8 lg:col-span-3">
          <div>
            <h1 className="text-xl font-semibold">Create your account</h1>
            <p className="text-sm text-on-surface-variant">Your data stays separate from everyone else&apos;s and goes through your own Plaid keys.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Username" error={errors.username} hint="3–24 letters, numbers or _">
              <input className={`${AUTH_INPUT} ${border("username")}`} autoFocus autoCapitalize="none" autoComplete="username" value={form.username} onChange={set("username")} placeholder="ved" />
            </Field>
            <Field label="Email" error={errors.email}>
              <input className={`${AUTH_INPUT} ${border("email")}`} type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
            </Field>
          </div>
          <Field label="Password" error={errors.password} hint="At least 8 characters">
            <input className={`${AUTH_INPUT} ${border("password")}`} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </Field>

          <div className="mt-1 flex items-center gap-2 border-t border-white/5 pt-4">
            <Icon name="key" size={18} className="text-secondary" />
            <p className="text-sm font-semibold">Your Plaid API keys</p>
          </div>
          <Field label="Plaid client_id" error={errors.plaid_client_id}>
            <input className={`${AUTH_INPUT} ${border("plaid_client_id")} font-mono`} autoCapitalize="none" autoComplete="off" spellCheck={false} value={form.plaid_client_id} onChange={set("plaid_client_id")} placeholder="24 characters" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Plaid secret" error={errors.plaid_secret}>
                <div className="relative">
                  <input className={`${AUTH_INPUT} ${border("plaid_secret")} pr-10 font-mono`} type={showSecret ? "text" : "password"} autoComplete="off" spellCheck={false} value={form.plaid_secret} onChange={set("plaid_secret")} placeholder="30 characters" />
                  <button type="button" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? "Hide secret" : "Show secret"} className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-on-surface-variant">
                    <Icon name={showSecret ? "visibility_off" : "visibility"} size={18} />
                  </button>
                </div>
              </Field>
            </div>
            <Field label="Environment" hint="Must match the secret">
              <select className={`${AUTH_INPUT} border-white/10`} value={form.plaid_env} onChange={set("plaid_env")}>
                <option value="sandbox">Sandbox (test banks)</option>
                <option value="production">Production (real banks)</option>
              </select>
            </Field>
          </div>

          {errors.form && <p className="rounded-lg bg-error-container/30 px-3 py-2 text-xs text-error">{errors.form}</p>}
          <button type="submit" disabled={busy}
            className="mt-1 h-11 rounded-full bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50">
            {busy ? "Checking your Plaid keys…" : "Create account"}
          </button>
          <p className="text-center text-xs text-on-surface-variant">
            Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </form>

        <aside className="glass flex flex-col gap-4 rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Icon name="help" size={20} className="text-secondary" />
            <h2 className="font-semibold">How to get Plaid API keys</h2>
          </div>
          <ol className="flex flex-col gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-brand text-[11px] font-bold text-white">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-auto rounded-xl bg-surface-container-low p-3 text-[11px] leading-relaxed text-on-surface-variant">
            <p className="mb-1 flex items-center gap-1 font-semibold text-on-surface"><Icon name="info" size={14} /> Good to know</p>
            Plaid bills your own Plaid account for production usage. This app only reads data; it can&apos;t move money. You can change keys later on the Connect page.
          </div>
        </aside>
      </div>
    </AuthShell>
  )
}
