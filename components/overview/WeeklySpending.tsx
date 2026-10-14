"use client"

import { useMemo, useState } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { useApi, sendJson } from "@/components/hooks/useApi"
import { Panel, SectionLabel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { addDays, categoryBreakdown, isoWeekNumber, startOfWeek, weekBuckets, ymd } from "@/lib/finance"
import { money, shortDate } from "@/lib/format"
import type { UserSettings } from "@/lib/types"

interface Props {
  weekOffset: number
  onWeekChange: (offset: number) => void
}

export function WeeklySpending({ weekOffset, onWeekChange }: Props) {
  const { transactions, hidden, notify } = useFinance()
  const settings = useApi<{ settings: UserSettings }>("/api/settings")
  const budget = settings.data?.settings.weekly_budget ?? null

  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => weekBuckets(transactions, weekStart), [transactions, weekStart])
  const total = days.reduce((s, d) => s + d.total, 0)
  const peak = days.reduce((p, d) => (d.total > p.total ? d : p), days[0])
  const max = Math.max(...days.map((d) => d.total), 1)
  const todayStr = ymd(new Date())

  const [selected, setSelected] = useState<string | null>(null)
  const sel = days.find((d) => d.date === selected) ?? (peak.total > 0 ? peak : null)
  const selCats = sel ? categoryBreakdown(sel.txns).slice(0, 2).map((c) => c.category).join(" & ") : ""

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  async function saveBudget() {
    const v = draft.trim() === "" ? null : Number(draft)
    if (v !== null && (!Number.isFinite(v) || v < 0)) return notify("Enter a valid amount", "error")
    try {
      await sendJson("/api/settings", "PATCH", { weekly_budget: v })
      settings.setData({ settings: { weekly_budget: v } })
      setEditing(false)
      notify("Weekly budget saved")
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save budget", "error")
    }
  }

  const usedPct = budget ? (total / budget) * 100 : 0
  const remaining = budget ? budget - total : 0
  const weekEnd = addDays(weekStart, 6)

  return (
    <Panel
      title="Weekly Spending"
      icon="equalizer"
      className="h-full"
      action={
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous week" onClick={() => { onWeekChange(weekOffset - 1); setSelected(null) }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface">
            <Icon name="chevron_left" size={20} />
          </button>
          <Badge tone="secondary" className="min-w-[132px] justify-center">
            Week {isoWeekNumber(weekStart)} · {shortDate(ymd(weekStart))}–{shortDate(ymd(weekEnd)).split(" ").pop()}
          </Badge>
          <button type="button" aria-label="Next week" disabled={weekOffset >= 0} onClick={() => { onWeekChange(weekOffset + 1); setSelected(null) }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30">
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Money value={total} className="text-[32px] leading-10 font-bold tracking-tight" />
            <span className="text-sm text-on-surface-variant"> spent</span>
          </div>
          <div className="text-right">
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); void saveBudget() }} className="flex items-center gap-1.5">
                <span className="text-xs text-on-surface-variant">Budget $</span>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step="any"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="1200"
                  className="w-24 rounded-lg border border-white/10 bg-surface-container-lowest px-2 py-1 text-sm tabular outline-none focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"
                />
                <button type="submit" className="text-xs font-semibold text-secondary">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="text-xs text-on-surface-variant">Cancel</button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => { setDraft(budget?.toString() ?? ""); setEditing(true) }}
                className="group inline-flex items-center gap-1 text-sm"
                title={settings.setupRequired ? "Run the Supabase migration to enable budgets" : "Edit weekly budget"}
              >
                <span className="text-xs font-semibold text-on-surface-variant">Budget:</span>
                <span className="font-semibold">{budget !== null ? <Money value={budget} /> : "Set a budget"}</span>
                <Icon name="edit" size={14} className="text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>

        {budget !== null && (
          <div className="flex flex-col gap-2">
            <ProgressBar
              value={usedPct}
              glow
              fill={usedPct > 100 ? "bg-gradient-to-r from-rose-400 to-error" : "bg-gradient-to-r from-secondary to-primary"}
              label="Weekly budget used"
            />
            <div className="flex justify-between text-[11px] font-semibold text-on-surface-variant">
              <span>{usedPct.toFixed(0)}% of weekly limit</span>
              <span className={remaining >= 0 ? "text-tertiary" : "text-error"}>
                {hidden ? "••••" : money(Math.abs(remaining))} {remaining >= 0 ? "remaining" : "over budget"}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Daily velocity</SectionLabel>
            {peak.total > 0 && (
              <span className="text-[11px] font-semibold text-secondary">
                Peak: {peak.label} ({hidden ? "••••" : money(peak.total)})
              </span>
            )}
          </div>
          <div className="flex h-44 items-end justify-between gap-3 rounded-xl bg-surface-container-low/70 px-4 pt-6 pb-2">
            {days.map((d) => {
              const isSel = sel?.date === d.date
              const future = d.date > todayStr
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={future}
                  onClick={() => setSelected(d.date)}
                  aria-label={`${d.label}: ${money(d.total)}`}
                  aria-pressed={isSel}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5 outline-none disabled:opacity-30"
                >
                  <span className={`tabular text-[10px] font-semibold transition-opacity ${isSel ? "text-secondary opacity-100" : "text-on-surface-variant opacity-0 group-hover:opacity-100"}`}>
                    {hidden ? "••" : money(d.total, { cents: false })}
                  </span>
                  <div
                    className={`w-full max-w-[44px] rounded-t-md transition-all ${
                      isSel
                        ? "bg-gradient-to-t from-secondary-container to-secondary glow-secondary"
                        : "bg-surface-container-highest group-hover:bg-primary/50"
                    }`}
                    style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
                  />
                  <span className={`text-[11px] font-semibold ${isSel ? "text-secondary" : d.date === todayStr ? "text-on-surface" : "text-on-surface-variant"}`}>
                    {d.label}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="pt-1 text-center text-xs text-on-surface-variant">
            {sel ? (
              <>
                Selected: <span className="font-semibold text-secondary">{new Date(sel.date + "T00:00").toLocaleDateString("en-US", { weekday: "long" })}, {hidden ? "••••" : money(sel.total)}</span>
                {selCats && ` (${selCats})`} · {sel.txns.length} {sel.txns.length === 1 ? "transaction" : "transactions"}
              </>
            ) : (
              "No spending recorded this week yet."
            )}
          </p>
        </div>
      </div>
    </Panel>
  )
}
