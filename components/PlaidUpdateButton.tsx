"use client"

import { useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@/components/ui/Button"

interface Props {
  itemId: string
  /** Extra products to request consent for; omit to just repair a broken login */
  consent?: string[]
  label: string
  onDone: () => void
  onError: (msg: string) => void
}

/**
 * Plaid Link "update mode": re-authenticates or adds product consent on an
 * EXISTING connection. Same access token, same accounts, no duplicates.
 */
export function PlaidUpdateButton({ itemId, consent, label, onDone, onError }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: () => { setToken(null); onDone() },
    onExit: (err) => { setToken(null); if (err) onError(err.display_message ?? err.error_message ?? "Plaid exited") },
  })

  // Open as soon as the token is ready
  useEffect(() => {
    if (token && ready) open()
  }, [token, ready, open])

  async function start() {
    setLoading(true)
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, consent }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(typeof data.error === "string" ? data.error : data.error?.error_message ?? "Couldn't start Plaid")
      setToken(data.link_token)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't start Plaid")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" variant="primary" icon="key" loading={loading} onClick={start}>
      {label}
    </Button>
  )
}
