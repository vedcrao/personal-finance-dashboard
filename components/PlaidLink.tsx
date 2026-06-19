"use client"

import { useCallback, useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"

interface ConnectedBank {
  institution_name: string
  plaid_item_id: string
}

export default function PlaidLink() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [connectedBanks, setConnectedBanks] = useState<ConnectedBank[]>([])

  async function fetchLinkToken() {
    const res = await fetch("/api/plaid/create-link-token", { method: "POST" })
    const data = await res.json()
    if (data.error) console.error("Failed to get link token:", data.error)
    else setLinkToken(data.link_token)
  }

  async function fetchConnectedBanks() {
    const res = await fetch("/api/plaid/connected-banks")
    const data = await res.json()
    setConnectedBanks(data.banks ?? [])
  }

  useEffect(() => {
    fetchLinkToken()
    fetchConnectedBanks()
  }, [])

  const onSuccess = useCallback(async (public_token: string) => {
    const res = await fetch("/api/plaid/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_token }),
    })
    const data = await res.json()
    if (data.success) {
      await fetchConnectedBanks()
      await fetchLinkToken()
    }
  }, [])

  const onExit = useCallback((err: any, metadata: any) => {
    console.log("Plaid exited:", err, metadata)
  }, [])

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit })

  return (
    <div className="flex flex-col gap-3">
      {connectedBanks.length > 0 && (
        <div className="flex flex-col gap-1">
          {connectedBanks.map((bank) => (
            <div key={bank.plaid_item_id} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              {bank.institution_name} connected
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => open()}
        disabled={!ready}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {connectedBanks.length > 0 ? "+ Connect Another Bank" : "Connect Bank Account"}
      </button>
    </div>
  )
}
