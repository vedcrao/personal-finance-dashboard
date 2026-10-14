"use client"

import { useState } from "react"
import PlaidLink from "@/components/PlaidLink"
import { ConnectionsPanel } from "@/components/connect/ConnectionsPanel"
import { useFinance } from "@/components/providers/FinanceProvider"
import { sendJson } from "@/components/hooks/useApi"
import { Panel } from "@/components/ui/Panel"
import { Button } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"

const PIPELINE = [
  { icon: "bolt", title: "Plaid webhook", body: "Plaid tells the app when a bank has new transactions, usually a few times a day" },
  { icon: "sync", title: "Incremental sync", body: "Only what changed (new, updated, removed) is pulled using a saved cursor" },
  { icon: "rule", title: "Your rules first", body: "“Zelle to Jay Vanam → Rent”. Set by ticking “apply to similar” when editing" },
  { icon: "category", title: "Plaid's categories", body: "Used directly when Plaid is confident (most transactions)" },
  { icon: "auto_awesome", title: "AI only as fallback", body: "Groq/Gemini only see the transactions Plaid wasn't sure about" },
]

export default function ConnectPage() {
  const { syncAndCategorize, syncing, refresh, notify } = useFinance()
  const [recategorizing, setRecategorizing] = useState(false)
  const [connectKey, setConnectKey] = useState(0)

  async function recategorizeAll() {
    setRecategorizing(true)
    try {
      const r = await sendJson<{ categorized: number; llmUsed: number }>("/api/ai/categorize", "POST", { mode: "all" })
      notify(`Re-categorized ${r.categorized} transactions · ${r.llmUsed} needed AI`)
      await refresh()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Re-categorize failed", "error")
    } finally {
      setRecategorizing(false)
    }
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-col gap-6 xl:col-span-7">
        <ConnectionsPanel key={connectKey} />

        <Panel title="Add an institution" icon="add_link" glow="primary">
          <p className="mb-4 text-sm text-on-surface-variant">
            Link banks, cards and brokerages through Plaid. Read-only: this app can&apos;t move money.
            To add a permission to a bank that&apos;s already linked, use its button above instead of linking it again.
          </p>
          <PlaidLink
            hideList
            onConnected={async (inst) => {
              notify(`${inst} connected`)
              setConnectKey((k) => k + 1)
              await refresh()
            }}
          />
        </Panel>

        <Panel title="Manual controls" icon="tune" iconClass="text-tertiary">
          <p className="mb-4 text-sm text-on-surface-variant">
            With auto-updates on you shouldn&apos;t need these. Sync pulls changes right now; re-categorize re-applies your rules
            and Plaid&apos;s categories to everything you haven&apos;t edited by hand.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="sync" loading={!!syncing} onClick={syncAndCategorize}>{syncing ?? "Sync now"}</Button>
            <Button icon="category" loading={recategorizing} onClick={recategorizeAll}>Re-categorize everything</Button>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 xl:col-span-5">
        <Panel title="How updates flow in" icon="account_tree" iconClass="text-secondary">
          <ol className="flex flex-col gap-4">
            {PIPELINE.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-secondary">
                  <Icon name={s.icon} size={18} />
                  <span className="absolute -top-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-brand text-[9px] font-bold text-white">{i + 1}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-on-surface-variant">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-white/5 pt-4 text-xs text-on-surface-variant">
            A daily backup sync also runs on Vercel in case a webhook is missed. Open tabs refresh automatically when you come back to them.
          </p>
        </Panel>
      </div>
    </div>
  )
}
