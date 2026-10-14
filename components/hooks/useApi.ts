"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Minimal fetch-on-mount hook for page-local data (settings, goals, snapshots).
 * Returns `setupRequired` when the API reports the Supabase migration hasn't been run.
 */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [loading, setLoading] = useState(!!url)

  const load = useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
      setData(json as T)
      setSetupRequired(!!json.setupRequired)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state set after await
    void load()
  }, [load])

  return { data, error, loading, setupRequired, reload: load, setData }
}

export async function sendJson<T = unknown>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}
