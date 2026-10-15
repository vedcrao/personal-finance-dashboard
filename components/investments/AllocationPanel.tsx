"use client"

import { Panel } from "@/components/ui/Panel"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { EmptyState } from "@/components/ui/States"
import { ALLOCATION_COLORS } from "@/lib/finance"

export interface Slice { label: string; value: number; count?: number }

interface Props {
  slices: Slice[]
  title?: string
  subtitle?: React.ReactNode
  /** Click a slice to filter holdings to it; click again (or ✕) to clear */
  selected?: string | null
  onSelect?: (label: string | null) => void
}

export function AllocationPanel({ slices, title = "Asset Allocation", subtitle, selected, onSelect }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  const pick = (label: string) => onSelect?.(selected === label ? null : label)

  return (
    <Panel title={title} icon="pie_chart" iconClass="text-primary" className="h-full" action={typeof subtitle === "string" ? <span className="text-[11px] text-on-surface-variant">{subtitle}</span> : subtitle}>
      {sorted.length === 0 || total <= 0 ? (
        <EmptyState icon="pie_chart" title="No allocation data" />
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-lowest p-0.5">
            {sorted.map((s, i) => (
              <button
                key={s.label}
                type="button"
                disabled={!onSelect}
                onClick={() => pick(s.label)}
                title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}
                aria-label={`Filter holdings to ${s.label}`}
                className={`h-full transition-all first:rounded-l-full last:rounded-r-full ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} ${selected && selected !== s.label ? "opacity-25" : ""}`}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {sorted.map((s, i) => {
              const active = selected === s.label
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={!onSelect}
                  onClick={() => pick(s.label)}
                  aria-pressed={active}
                  className={`flex flex-col justify-between rounded-xl p-3 text-left transition-all ${
                    active ? "bg-indigo-brand/15 ring-1 ring-indigo-brand/50"
                      : selected ? "bg-surface-container-low opacity-50 hover:opacity-100"
                      : "bg-surface-container-low hover:bg-surface-container-high"
                  } ${onSelect ? "cursor-pointer" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`} />
                    <span className="truncate text-[11px] font-semibold text-on-surface-variant">{s.label}</span>
                    {s.count !== undefined && <span className="text-[10px] text-on-surface-variant/70">· {s.count}</span>}
                    {active && <Icon name="filter_alt" size={13} className="ml-auto text-primary" />}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <Money value={s.value} className="truncate text-sm font-semibold" />
                    <span className="text-[11px] font-semibold text-on-surface-variant">{((s.value / total) * 100).toFixed(0)}%</span>
                  </div>
                </button>
              )
            })}
          </div>
          {onSelect && (
            <p className="mt-3 text-[11px] text-on-surface-variant">
              {selected ? (
                <button type="button" onClick={() => onSelect(null)} className="font-semibold text-primary hover:underline">Show all holdings</button>
              ) : "Tap a group to see just those holdings"}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
