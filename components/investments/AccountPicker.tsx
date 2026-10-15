"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import type { Account } from "@/lib/types"

export interface PickerOption {
  id: string | null
  name: string
  detail: string
  balance: number
  gain: { gain: number; pct: number } | null
}

function Gain({ g }: { g: PickerOption["gain"] }) {
  if (!g) return null
  return (
    <span className={`text-[11px] font-semibold ${g.gain >= 0 ? "text-tertiary" : "text-error"}`}>
      <Money value={g.gain} sign cents={false} /> ({g.pct >= 0 ? "+" : ""}{g.pct.toFixed(1)}%)
    </span>
  )
}

/** Dropdown of investment accounts (balance + gain per account). */
export function AccountPicker({ options, value, onChange }: { options: PickerOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative w-full md:w-auto md:min-w-[340px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-label={`Choose account (current: ${current.name})`}
        aria-expanded={open}
        className="glass flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-surface-container-high/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name={current.id ? "work" : "select_all"} size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{current.name}</p>
            <p className="truncate text-[11px] uppercase text-on-surface-variant">{current.detail}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex flex-col items-end">
            <Money value={current.balance} cents={false} className="text-sm font-semibold" />
            <Gain g={current.gain} />
          </div>
          <Icon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
        </div>
      </button>

      {open && (
        <ul role="listbox" className="glass-raised absolute left-0 right-0 top-[calc(100%+6px)] z-30 animate-pop-in overflow-hidden rounded-2xl p-1.5">
          {options.map((o) => {
            const active = o.id === value
            return (
              <li key={o.id ?? "all"} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => { onChange(o.id); setOpen(false) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-indigo-brand/15" : "hover:bg-white/[0.05]"}`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon name={active ? "radio_button_checked" : "radio_button_unchecked"} size={16} className={active ? "text-primary" : "text-on-surface-variant"} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{o.name}</p>
                      <p className="truncate text-[11px] uppercase text-on-surface-variant">{o.detail}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <Money value={o.balance} cents={false} className="text-sm font-semibold" />
                    <Gain g={o.gain} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function accountGain(holdings: Account["holdings"]): PickerOption["gain"] {
  const withBasis = holdings.filter((h) => h.cost_basis !== null)
  if (!withBasis.length) return null
  const basis = withBasis.reduce((s, h) => s + (h.cost_basis ?? 0), 0)
  const gain = withBasis.reduce((s, h) => s + h.value, 0) - basis
  return { gain, pct: basis ? (gain / basis) * 100 : 0 }
}
