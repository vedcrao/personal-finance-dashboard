"use client"

import { useEffect, useRef } from "react"
import { Icon } from "@/components/ui/Icon"

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Every month from the earliest transaction through the current month, as "YYYY-MM". */
export function monthRange(earliest: string | null, now = new Date()): string[] {
  const end = now.getFullYear() * 12 + now.getMonth()
  const startIdx = earliest ? Number(earliest.slice(0, 4)) * 12 + Number(earliest.slice(5, 7)) - 1 : end - 5
  const out: string[] = []
  for (let i = Math.min(startIdx, end); i <= end; i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`)
  return out
}

interface Props {
  months: string[] // ascending YYYY-MM
  value: string
  onChange: (month: string) => void
  /** Optional per-month spend shown under each label */
  totals?: Map<string, number>
  hidden?: boolean
}

/** Horizontally scrollable month strip with year markers, prev/next arrows and year jump. */
export function MonthScroller({ months, value, onChange, totals, hidden }: Props) {
  const strip = useRef<HTMLDivElement>(null)
  const idx = months.indexOf(value)
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]

  // Keep the selected month centered
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-month="${value}"]`)
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [value])

  const step = (d: number) => {
    const next = months[idx + d]
    if (next) onChange(next)
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {years.length > 1 && (
        <select
          aria-label="Jump to year"
          value={value.slice(0, 4)}
          onChange={(e) => onChange([...months].reverse().find((m) => m.startsWith(e.target.value)) ?? value)}
          className="h-9 shrink-0 appearance-none rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-semibold outline-none focus:border-indigo-brand"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
      <button type="button" aria-label="Previous month" disabled={idx <= 0} onClick={() => step(-1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30">
        <Icon name="chevron_left" size={20} />
      </button>

      <div ref={strip} className="flex min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Month">
        {months.map((m, i) => {
          const active = m === value
          const showYear = i === 0 || m.endsWith("-01")
          const total = totals?.get(m)
          return (
            <div key={m} className="flex shrink-0 items-center gap-1">
              {showYear && (
                <span className="sticky left-0 shrink-0 px-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">{m.slice(0, 4)}</span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                data-month={m}
                onClick={() => onChange(m)}
                className={`snap-center whitespace-nowrap rounded-xl px-3 py-1.5 text-left text-xs font-semibold leading-tight transition-colors ${
                  active ? "bg-indigo-brand text-white" : "border border-white/[0.06] bg-white/[0.04] text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="block">{MONTH[Number(m.slice(5, 7)) - 1]}</span>
                {totals && (
                  <span className={`block text-[10px] font-normal tabular ${active ? "text-white/75" : "text-on-surface-variant/70"}`}>
                    {hidden ? "••" : total ? `$${Math.round(total).toLocaleString("en-US")}` : "—"}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <button type="button" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => step(1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30">
        <Icon name="chevron_right" size={20} />
      </button>
    </div>
  )
}
