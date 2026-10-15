"use client"

import Link from "next/link"
import { useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { PlaidKeysPanel } from "@/components/connect/PlaidKeysPanel"
import { Panel } from "@/components/ui/Panel"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Modal } from "@/components/ui/Modal"

function Row({ href, icon, label, detail }: { href: string; icon: string; label: string; detail?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] md:px-6">
      <span className="flex items-center gap-3">
        <Icon name={icon} size={20} className="text-on-surface-variant" />
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          {detail && <span className="block text-xs text-on-surface-variant">{detail}</span>}
        </span>
      </span>
      <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
    </Link>
  )
}

export default function SettingsPage() {
  const { me, signOut, accounts } = useFinance()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expected = (me?.username ?? me?.email ?? "").toLowerCase()
  const institutions = new Set(accounts.map((a) => a.institution_name)).size

  async function deleteAccount() {
    setDeleting(true)
    setError(null)
    const res = await fetch("/api/auth/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Couldn't delete the account")
      setDeleting(false)
      return
    }
    window.location.href = "/login?deleted=1"
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Panel title="Account" icon="person" iconClass="text-primary">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-brand/20 text-base font-bold uppercase text-primary">
              {(me?.username ?? me?.email ?? "?")[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">@{me?.username ?? "—"}</p>
              <p className="truncate text-xs text-on-surface-variant">{me?.email}</p>
            </div>
          </div>
          <Button size="sm" icon="logout" onClick={signOut}>Sign out</Button>
        </div>
      </Panel>

      <PlaidKeysPanel />

      <Panel title="Legal & help" icon="gavel" iconClass="text-secondary" padded={false}>
        <div className="divide-y divide-white/[0.04]">
          <Row href="/privacy" icon="shield_lock" label="Privacy Policy" detail="What we collect, AI processing, deletion" />
          <Row href="/terms" icon="description" label="Terms & Disclaimer" detail="Not financial advice; read-only access" />
          <Row href="/support" icon="help" label="Support" detail="FAQ and contact" />
        </div>
      </Panel>

      <Panel title="Danger zone" icon="warning" iconClass="text-error">
        <p className="text-sm text-on-surface-variant">
          Permanently delete your account. This disconnects {institutions ? `all ${institutions} bank${institutions === 1 ? "" : "s"}` : "your banks"} from Plaid and
          deletes your profile, Plaid keys, accounts, transactions, rules, goals and history. This can&apos;t be undone.
        </p>
        <Button variant="danger" icon="delete_forever" className="mt-4" onClick={() => { setOpen(true); setConfirm(""); setError(null) }}>
          Delete account
        </Button>
      </Panel>

      <Modal
        open={open}
        onClose={() => !deleting && setOpen(false)}
        title="Delete account?"
        icon="delete_forever"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" icon="delete_forever" loading={deleting} disabled={confirm.trim().toLowerCase() !== expected} onClick={deleteAccount}>
              Delete forever
            </Button>
          </>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Everything is deleted immediately and your banks are disconnected. Type <b className="text-on-surface">{expected}</b> to confirm.
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          placeholder={expected}
          className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 text-sm outline-none focus:border-error"
        />
        {error && <p className="mt-2 text-xs text-error">{error}</p>}
      </Modal>
    </div>
  )
}
