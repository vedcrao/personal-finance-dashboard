"use client"

import type { ReactNode } from "react"

interface Option<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  size?: "sm" | "md"
  className?: string
  ariaLabel?: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", className = "", ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-xl border border-white/[0.04] bg-surface-container-lowest p-1 shadow-inner ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-1.5 text-sm"
            } ${
              active
                ? "bg-surface-container-highest text-on-surface shadow-sm shadow-black/30"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
