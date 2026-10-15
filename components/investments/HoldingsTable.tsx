"use client"

import { Fragment, useMemo, useState } from "react"
import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { EmptyState } from "@/components/ui/States"
import { SECURITY_TYPE_LABELS } from "@/lib/finance"
import { shortDate } from "@/lib/format"
import type { Holding } from "@/lib/types"

export interface HoldingRow extends Holding { accountId: string; accountName: string; accountBalance: number }

type SortKey = "value" | "name" | "gain" | "gainPct" | "weight"

const SYMBOL_COLORS = ["text-primary", "text-secondary", "text-tertiary", "text-primary-container", "text-amber-300"]

function gainOf(rows: Holding[]) {
  const withBasis = rows.filter((r) => r.cost_basis !== null)
  if (!withBasis.length) return { gain: null, pct: null }
  const basis = withBasis.reduce((s, r) => s + (r.cost_basis ?? 0), 0)
  const gain = withBasis.reduce((s, r) => s + r.value, 0) - basis
  return { gain, pct: basis ? (gain / basis) * 100 : null }
}

function GainCell({ gain, pct }: { gain: number | null; pct: number | null }) {
  if (gain === null) return <span className="text-on-surface-variant">—</span>
  return (
    <span className={`inline-flex flex-col items-end ${gain >= 0 ? "text-tertiary" : "text-error"}`}>
      <Money value={gain} sign className="font-semibold" />
      {pct !== null && (
        <span className="inline-flex items-center text-[11px] font-semibold">
          <Icon name={pct >= 0 ? "arrow_drop_up" : "arrow_drop_down"} size={14} />
          {Math.abs(pct).toFixed(2)}%
        </span>
      )}
    </span>
  )
}

export function HoldingsTable({ rows, needsConsent, filterLabel, onClearFilter }: {
  rows: HoldingRow[]
  needsConsent: boolean
  /** Active allocation filter (e.g. "ETFs"), shown as a removable chip */
  filterLabel?: string | null
  onClearFilter?: () => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 })
  const [group, setGroup] = useState<"account" | "all">("account")
  // By-account groups collapse; default closed unless there's only one account or a filter is on
  const [openState, setOpenState] = useState<Record<string, boolean>>({})
  const total = rows.reduce((s, r) => s + r.value, 0)

  const data = useMemo(() => {
    const enriched = rows.map((r) => {
      const gain = r.cost_basis !== null ? r.value - r.cost_basis : null
      const gainPct = gain !== null && r.cost_basis ? (gain / r.cost_basis) * 100 : null
      return { ...r, gain, gainPct, weight: total > 0 ? (r.value / total) * 100 : 0 }
    })
    return enriched.sort((a, b) => {
      const k = sort.key
      if (k === "name") return a.name.localeCompare(b.name) * sort.dir
      return ((a[k] ?? -Infinity) - (b[k] ?? -Infinity)) * sort.dir
    })
  }, [rows, sort, total])

  const groups = useMemo(() => {
    if (group === "all") return [{ id: "all", name: "", balance: total, rows: data }]
    const m = new Map<string, { id: string; name: string; balance: number; rows: typeof data }>()
    for (const r of data) {
      const g = m.get(r.accountId) ?? { id: r.accountId, name: r.accountName, balance: r.accountBalance, rows: [] }
      g.rows.push(r)
      m.set(r.accountId, g)
    }
    return [...m.values()].sort((a, b) => b.balance - a.balance)
  }, [data, group, total])

  const defaultOpen = groups.length === 1 || !!filterLabel
  const isOpen = (id: string) => group === "all" || (openState[id] ?? defaultOpen)
  const toggle = (id: string) => setOpenState((o) => ({ ...o, [id]: !isOpen(id) }))
  const allOpen = groups.every((g) => isOpen(g.id))
  const setAll = (v: boolean) => setOpenState(Object.fromEntries(groups.map((g) => [g.id, v])))

  const asOf = rows.map((r) => r.price_as_of).filter(Boolean).sort().pop()

  const th = (key: SortKey | null, label: string, align: "left" | "right" = "right") => (
    <th className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant ${align === "left" ? "text-left" : "text-right"}`}>
      {key ? (
        <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
          className={`inline-flex items-center gap-0.5 hover:text-on-surface ${sort.key === key ? "text-on-surface" : ""}`}>
          {label}
          {sort.key === key && <Icon name={sort.dir === -1 ? "arrow_drop_down" : "arrow_drop_up"} size={16} />}
        </button>
      ) : label}
    </th>
  )

  return (
    <Panel
      title={<div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Holdings</h2><Badge>{rows.length} positions</Badge>
        {filterLabel && (
          <button type="button" onClick={onClearFilter} aria-label={`Clear ${filterLabel} filter`}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-brand/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Icon name="filter_alt" size={13} /> {filterLabel} <Icon name="close" size={13} />
          </button>
        )}{asOf && <span className="text-[11px] text-on-surface-variant">prices as of {shortDate(asOf.slice(0, 10))}</span>}</div>}
      icon="stacked_line_chart"
      iconClass="text-tertiary"
      padded={false}
      action={rows.length > 0 && (
        <div className="flex items-center gap-3">
        {group === "account" && groups.length > 1 && (
          <button type="button" onClick={() => setAll(!allOpen)} className="text-xs font-semibold text-primary hover:underline">
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
        <SegmentedControl size="sm" ariaLabel="Group holdings" value={group} onChange={setGroup}
          options={[{ value: "account", label: "By account" }, { value: "all", label: "All positions" }]} />
        </div>
      )}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="stacked_line_chart"
          title={needsConsent ? "Investments access not granted yet" : "No holdings reported"}
          action={needsConsent && <ButtonLink href="/connect" variant="primary" icon="key">Grant access on Connect</ButtonLink>}
        >
          {needsConsent
            ? "Your brokerage was linked without the Investments permission. Grant it on the Connect page (no re-linking, no duplicate accounts) to see every position, cost basis and gain."
            : "Plaid didn't return any positions for these accounts."}
        </EmptyState>
      ) : (
        <>
        {/* Phone: one row per position (value + return always visible) */}
        <div className="md:hidden">
          {groups.map((g) => {
            const gg = gainOf(g.rows)
            return (
              <div key={g.id}>
                {group === "account" && (
                  <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen(g.id)}
                    className="flex w-full items-center justify-between gap-2 border-y border-white/5 bg-surface-container-low/60 px-4 py-3 text-left text-xs font-semibold active:bg-surface-container-high">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Icon name={isOpen(g.id) ? "expand_more" : "chevron_right"} size={18} className="shrink-0 text-on-surface-variant" />
                      <span className="truncate">{g.name}</span>
                      <span className="shrink-0 font-normal text-on-surface-variant">· {g.rows.length}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2"><Money value={g.rows.reduce((s, r) => s + r.value, 0)} cents={false} /><GainCell gain={gg.gain} pct={gg.pct} /></span>
                  </button>
                )}
                {isOpen(g.id) && <ul className="divide-y divide-white/[0.04]">
                  {g.rows.map((h, i) => (
                    <li key={`${h.accountId}-${h.symbol ?? h.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest">
                          <span className={`text-[10px] font-bold ${SYMBOL_COLORS[i % SYMBOL_COLORS.length]}`}>{(h.symbol ?? h.name.slice(0, 3)).slice(0, 5).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{h.symbol ?? h.name}</p>
                          <p className="truncate text-[11px] text-on-surface-variant">
                            {h.quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} sh · {SECURITY_TYPE_LABELS[h.security_type ?? "other"] ?? h.security_type}
                            {group === "all" && ` · ${h.accountName}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <Money value={h.value} className="text-sm font-semibold" />
                        <span className="text-[11px]"><GainCell gain={h.gain} pct={h.gainPct} /></span>
                      </div>
                    </li>
                  ))}
                </ul>}
              </div>
            )
          })}
        </div>
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {th("name", "Asset", "left")}
                {group === "all" && th(null, "Account", "left")}
                {th(null, "Shares")}
                {th(null, "Price")}
                {th("value", "Value")}
                {th(null, "Cost basis")}
                {th("gain", "Gain / return")}
                {th("weight", "Weight")}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const gg = gainOf(g.rows)
                const held = g.rows.reduce((s, r) => s + r.value, 0)
                return (
                  <Fragment key={g.id}>
                    {group === "account" && (
                      <tr onClick={() => toggle(g.id)} aria-expanded={isOpen(g.id)}
                        className="cursor-pointer border-y border-white/5 bg-surface-container-low/60 transition-colors hover:bg-surface-container-high/60">
                        <td className="px-4 py-2.5" colSpan={3}>
                          <button type="button" className="flex items-center gap-2 text-xs font-semibold" aria-label={`${isOpen(g.id) ? "Collapse" : "Expand"} ${g.name}`}>
                            <Icon name={isOpen(g.id) ? "expand_more" : "chevron_right"} size={18} className="text-on-surface-variant" />
                            <Icon name="work" size={16} className="text-primary" /> {g.name}
                            <span className="font-normal text-on-surface-variant">· {g.rows.length} {g.rows.length === 1 ? "position" : "positions"}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold"><Money value={held} /></td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-right text-xs"><GainCell gain={gg.gain} pct={gg.pct} /></td>
                        <td className="px-4 py-2.5 text-right text-[11px] text-on-surface-variant">{total ? ((held / total) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    )}
                    {isOpen(g.id) && g.rows.map((h, i) => (
                      <tr key={`${h.accountId}-${h.symbol ?? h.name}-${i}`} className="border-b border-white/[0.04] transition-colors hover:bg-surface-container-high/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest">
                              <span className={`text-[11px] font-bold ${SYMBOL_COLORS[i % SYMBOL_COLORS.length]}`}>{(h.symbol ?? h.name.slice(0, 3)).slice(0, 5).toUpperCase()}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-[280px] truncate font-semibold">{h.name}</p>
                              <p className="max-w-[280px] truncate text-[11px] text-on-surface-variant">
                                {SECURITY_TYPE_LABELS[h.security_type ?? "other"] ?? h.security_type}
                                {h.sector && ` · ${h.sector}`}
                                {h.industry && h.industry !== h.sector && ` · ${h.industry}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        {group === "all" && <td className="max-w-[160px] truncate px-4 py-3 text-on-surface-variant">{h.accountName}</td>}
                        <td className="px-4 py-3 text-right tabular text-on-surface-variant">{h.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="px-4 py-3 text-right text-on-surface-variant"><Money value={h.price} /></td>
                        <td className="px-4 py-3 text-right font-semibold"><Money value={h.value} /></td>
                        <td className="px-4 py-3 text-right text-on-surface-variant">{h.cost_basis !== null ? <Money value={h.cost_basis} /> : "—"}</td>
                        <td className="px-4 py-3 text-right"><GainCell gain={h.gain} pct={h.gainPct} /></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-container-highest">
                              <div className="h-full rounded-full bg-primary-container" style={{ width: `${h.weight}%` }} />
                            </div>
                            <span className="w-10 text-right tabular text-xs text-on-surface-variant">{h.weight.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Panel>
  )
}
