"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/States"
import { Panel } from "@/components/ui/Panel"

/** A page crashed while rendering: report it and offer a retry instead of a blank screen. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, path: location.pathname, context: { digest: error.digest, boundary: "app" } }),
    }).catch(() => {})
  }, [error])
  return (
    <Panel>
      <EmptyState icon="bug_report" title="Something went wrong on this page" action={<Button icon="refresh" onClick={reset}>Try again</Button>}>
        The error was reported automatically.
      </EmptyState>
    </Panel>
  )
}
