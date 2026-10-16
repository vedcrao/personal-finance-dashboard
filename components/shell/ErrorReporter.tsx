"use client"

import { useEffect } from "react"

/** Sends uncaught browser/app errors to /api/errors (deduped, max 10 per page load). */
export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>()
    const send = (message: string, stack?: string) => {
      if (!message || seen.has(message) || seen.size >= 10) return
      // Benign browser noise
      if (/ResizeObserver loop|Script error\.?$|Load failed|NetworkError|Failed to fetch|AbortError/i.test(message)) return
      seen.add(message)
      void fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stack, path: location.pathname + location.search }),
        keepalive: true,
      }).catch(() => {})
    }
    const onError = (e: ErrorEvent) => send(e.message, e.error?.stack)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string
      send(typeof r === "string" ? r : r?.message ?? "Unhandled promise rejection", typeof r === "string" ? undefined : r?.stack)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return null
}
