"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button, ButtonLink } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Skeleton } from "@/components/ui/States"
import { useFinance } from "@/components/providers/FinanceProvider"
import type { Account } from "@/lib/types"

interface Numbers { routing: string; account: string; wire_routing: string | null }

function formatAcct(n: string) {
  return n.replace(/(.{4})/g, "$1 ").trim()
}

export function AccountNumbersModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { notify } = useFinance()
  const [nums, setNums] = useState<Numbers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!account) return
    let cancelled = false
    // Reset when switching accounts, then fetch fresh (never cached).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before fetch
    setNums(null)
    setError(null)
    setRevealed(false)
    fetch(`/api/accounts/${account.id}/numbers`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json()
        if (cancelled) return
        if (!r.ok || j.error) setError(j.error ?? "Failed to load account numbers")
        else setNums(j)
      })
      .catch(() => !cancelled && setError("Failed to load account numbers"))
    return () => { cancelled = true }
  }, [account])

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    notify(`${label} copied`)
  }

  const rows = nums
    ? [
        { label: "Routing number (ACH / direct deposit)", value: nums.routing, display: nums.routing },
        ...(nums.wire_routing ? [{ label: "Wire routing number", value: nums.wire_routing, display: nums.wire_routing }] : []),
        {
          label: `${account?.name ?? "Account"} number`,
          value: nums.account,
          display: revealed ? formatAcct(nums.account) : `•••• •••• ${nums.account.slice(-4)}`,
        },
      ]
    : []

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title="Account Credentials"
      icon="verified_user"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      {error ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-on-surface-variant">{error}</p>
          <ButtonLink href="/connect" size="sm" icon="link">Go to Connect</ButtonLink>
        </div>
      ) : !nums ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-xl bg-surface-container-low p-3">
              <div>
                <p className="text-[11px] font-semibold text-on-surface-variant">{r.label}</p>
                <p className="mt-0.5 tabular text-base font-semibold tracking-widest">{r.display}</p>
              </div>
              <button
                type="button"
                aria-label={`Copy ${r.label}`}
                onClick={() => copy(r.value, r.label.split(" (")[0])}
                className="rounded-lg bg-secondary/10 p-2 text-secondary transition-colors hover:bg-secondary/20"
              >
                <Icon name="content_copy" size={18} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRevealed((v) => !v)} className="self-start text-xs font-semibold text-secondary hover:underline">
            {revealed ? "Hide full account number" : "Reveal full account number"}
          </button>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Icon name="lock" size={16} className="text-tertiary" />
            Fetched live from {account?.institution_name} via Plaid. Never stored by this app.
          </p>
        </div>
      )}
    </Modal>
  )
}
