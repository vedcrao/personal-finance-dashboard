"use client"

import { useEffect, useRef, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"

interface Action { type: "rule_created" | "rule_updated" | "rule_deleted"; summary: string; applied?: number }
interface Msg { role: "user" | "assistant"; content: string; actions?: Action[]; error?: boolean }

const SUGGESTIONS = [
  "If there's a recurring payment of 100+ to Rohan or 1000+ to Jay, classify them as Gym and Rent",
  "Treat Zelle money from Arnav as reimbursement",
  "How much did I spend on food last month?",
  "What rules do I have?",
]

const ACTION_STYLE = {
  rule_created: { icon: "add_task", cls: "text-tertiary", label: "Rule created" },
  rule_updated: { icon: "edit", cls: "text-secondary", label: "Rule updated" },
  rule_deleted: { icon: "delete", cls: "text-error", label: "Rule deleted" },
}

export function ChatPanel({ onRulesChanged }: { onRulesChanged: () => void }) {
  const { refresh } = useFinance()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [messages, busy])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: "user" as const, content }]
    setMessages(next)
    setInput("")
    setBusy(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? "Assistant failed")
      setMessages((m) => [...m, { role: "assistant", content: data.reply, actions: data.actions }])
      if (data.actions?.length) {
        onRulesChanged()
        if (data.refresh) void refresh()
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong", error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Assistant"
      icon="auto_awesome"
      iconClass="text-primary"
      className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col !p-0"
      action={messages.length > 0 && (
        <button type="button" onClick={() => setMessages([])} className="text-xs font-semibold text-on-surface-variant hover:text-on-surface">New chat</button>
      )}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon name="auto_awesome" size={24} /></div>
            <div>
              <p className="font-semibold">Tell me how to sort your money</p>
              <p className="mt-1 max-w-md text-sm text-on-surface-variant">
                Describe a rule in plain English and I&apos;ll find the matching transactions, preview them, and save it. Rules also apply to new transactions automatically.
              </p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:bg-white/[0.07] hover:text-on-surface">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "user" ? "bg-indigo-brand text-white"
                : m.error ? "bg-error-container/30 text-error"
                : "bg-surface-container-high text-on-surface"
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content.replace(/\*\*(.+?)\*\*/g, "$1")}</p>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
                  {m.actions.map((a, j) => {
                    const s = ACTION_STYLE[a.type]
                    return (
                      <div key={j} className="flex items-start gap-2 text-xs">
                        <Icon name={s.icon} size={16} className={`mt-px shrink-0 ${s.cls}`} />
                        <span>
                          <span className={`font-semibold ${s.cls}`}>{s.label}</span>
                          <span className="text-on-surface-variant"> · {a.summary}</span>
                          {a.applied !== undefined && <span className="text-on-surface-variant"> · {a.applied} updated</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Icon name="progress_activity" size={16} className="animate-spin" /> Looking through your transactions…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input) }} className="flex items-end gap-2 border-t border-white/5 p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input) } }}
          rows={1}
          placeholder="e.g. Zelle payments to Jay over $1000 are rent"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-surface-container-lowest px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-brand text-white transition-all hover:brightness-110 disabled:opacity-40">
          <Icon name="arrow_upward" size={20} />
        </button>
      </form>
    </Panel>
  )
}
