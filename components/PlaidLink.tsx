"use client"

import { useCallback, useEffect, useState } from "react"
import { usePlaidLink, type PlaidLinkOnExit } from "react-plaid-link"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"

interface ConnectedBank {
  institution_name: string
  plaid_item_id: string
}

export default function PlaidLink({ onConnected, hideList }: { onConnected?: (institution: string) => void; hideList?: boolean }) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [connectedBanks, setConnectedBanks] = useState<ConnectedBank[]>([])
  const [exchanging, setExchanging] = useState(false)

  const fetchLinkToken = useCallback(async () => {
    const res = await fetch("/api/plaid/create-link-token", { method: "POST" })
    const data = await res.json()
    if (data.error) {
      console.error("Failed to get link token:", data.error)
      setTokenError(typeof data.error === "string" ? data.error : data.error.error_message ?? "Plaid is unavailable")
    } else {
      setTokenError(null)
      setLinkToken(data.link_token)
    }
  }, [])

  const fetchConnectedBanks = useCallback(async () => {
    const res = await fetch("/api/plaid/connected-banks")
    const data = await res.json()
    setConnectedBanks(data.banks ?? [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state set after await
    void fetchLinkToken()
    void fetchConnectedBanks()
  }, [fetchLinkToken, fetchConnectedBanks])

  const onSuccess = useCallback(async (public_token: string) => {
    setExchanging(true)
    const res = await fetch("/api/plaid/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_token }),
    })
    const data = await res.json()
    setExchanging(false)
    if (data.success) {
      await fetchConnectedBanks()
      await fetchLinkToken()
      onConnected?.(data.institution)
    }
  }, [fetchConnectedBanks, fetchLinkToken, onConnected])

  const onExit = useCallback<PlaidLinkOnExit>((err, metadata) => {
    if (err) console.log("Plaid exited:", err, metadata)
  }, [])

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit })

  return (
    <div className="flex flex-col gap-3">
      {!hideList && connectedBanks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {connectedBanks.map((bank) => (
            <li key={bank.plaid_item_id} className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary/10 text-tertiary">
                <Icon name="account_balance" size={18} />
              </div>
              <span className="flex-1 font-semibold">{bank.institution_name}</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-tertiary">
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary" /> Connected
              </span>
            </li>
          ))}
        </ul>
      )}
      {tokenError && <p className="text-xs text-error">{tokenError}</p>}
      <Button variant={connectedBanks.length ? "secondary" : "primary"} icon="add_link" onClick={() => open()} disabled={!ready} loading={exchanging}>
        {connectedBanks.length > 0 ? "Connect another institution" : "Connect a bank account"}
      </Button>
    </div>
  )
}
