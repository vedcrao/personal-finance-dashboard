"use client"

import { useHidden } from "@/components/providers/FinanceProvider"
import { money, MASK } from "@/lib/format"

interface MoneyProps {
  value: number
  cents?: boolean
  sign?: boolean
  compact?: boolean
  /** Render cents smaller / dimmer, like the Stitch hero metrics */
  splitCents?: boolean
  className?: string
  centsClassName?: string
}

/** Currency amount that respects the global "hide balances" privacy toggle. */
export function Money({ value, cents = true, sign, compact, splitCents, className = "", centsClassName = "text-[0.6em] text-on-surface-variant" }: MoneyProps) {
  const hidden = useHidden()
  if (hidden) return <span className={`tabular ${className}`}>{sign ? "" : "$"}{MASK}</span>

  const text = money(value, { cents, sign, compact })
  if (splitCents && cents && !compact) {
    const dot = text.lastIndexOf(".")
    return (
      <span className={`tabular ${className}`}>
        {text.slice(0, dot)}
        <span className={centsClassName}>{text.slice(dot)}</span>
      </span>
    )
  }
  return <span className={`tabular ${className}`}>{text}</span>
}
