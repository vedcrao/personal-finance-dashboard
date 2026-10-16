"use client"

import { useState } from "react"
import { useApi } from "@/components/hooks/useApi"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { EmptyState, Notice, Skeleton } from "@/components/ui/States"

interface Row { id: number; created_at: string; source: string; message: string; stack: string | null; path: string | null; user_agent: string | null }

/** Owner-only: recent errors from the server and every user's app. */
export function ErrorLog() {
  const { data, loading, reload, setupRequired } = useApi<{ errors: Row[] }>("/api/errors")
  const [open, setOpen] = useState<number | null>(null)
  const rows = data?.errors ?? []
  // Count computed from the data itself (stable across renders)
  const newest = rows[0] ? new Date(rows[0].created_at).getTime() : 0
  const recent = rows.filter((r) => newest - new Date(r.created_at).getTime() < 7 * 86400000).length

  return (
    <Panel
      title={<div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Error log</h2><Badge tone={rows.length ? "negative" : "positive"}>{rows.length ? `${recent} recent` : "clean"}</Badge></div>}
      icon="bug_report"
      iconClass="text-error"
      padded={false}
      action={<button type="button" onClick={() => void reload()} className="text-xs font-semibold text-primary hover:underline">Refresh</button>}
    >
      {setupRequired ? (
        <div className="p-4"><Notice tone="warning">Run <code className="break-all text-xs">supabase/migrations/20261019_error_logs.sql</code> to turn on error monitoring.</Notice></div>
      ) : loading ? (
        <div className="p-4"><Skeleton className="h-12" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="verified" title="No errors recorded">Crashes and failed requests from the app and server show up here.</EmptyState>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-white/[0.04] overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03] md:px-6">
                <Icon name={r.source === "server" ? "dns" : "smartphone"} size={16} className="mt-0.5 shrink-0 text-on-surface-variant" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.message}</p>
                  <p className="truncate text-[11px] text-on-surface-variant">
                    {new Date(r.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {r.source} · {r.path ?? "—"}
                  </p>
                  {open === r.id && r.stack && (
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-container-lowest p-2 text-[10px] text-on-surface-variant">{r.stack}</pre>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
