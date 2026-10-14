import { Panel } from "@/components/ui/Panel"
import { Money } from "@/components/ui/Money"
import { EmptyState } from "@/components/ui/States"
import { ALLOCATION_COLORS } from "@/lib/finance"

export interface Slice { label: string; value: number }

export function AllocationPanel({ slices, title = "Asset Allocation", subtitle }: { slices: Slice[]; title?: string; subtitle?: React.ReactNode }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)

  return (
    <Panel title={title} icon="pie_chart" iconClass="text-primary" className="h-full" action={typeof subtitle === "string" ? <span className="text-[11px] text-on-surface-variant">{subtitle}</span> : subtitle}>
      {sorted.length === 0 || total <= 0 ? (
        <EmptyState icon="pie_chart" title="No allocation data" />
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-lowest p-0.5">
            {sorted.map((s, i) => (
              <div
                key={s.label}
                title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}
                className={`h-full transition-all first:rounded-l-full last:rounded-r-full ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {sorted.map((s, i) => (
              <div key={s.label} className="flex flex-col justify-between rounded-xl bg-surface-container-low p-3">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]}`} />
                  <span className="truncate text-[11px] font-semibold text-on-surface-variant">{s.label}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <Money value={s.value} className="truncate text-sm font-semibold" />
                  <span className="text-[11px] font-semibold text-on-surface-variant">{((s.value / total) * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
