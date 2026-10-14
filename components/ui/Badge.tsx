import type { ReactNode } from "react"
import { Icon } from "./Icon"

export type Tone = "neutral" | "primary" | "secondary" | "positive" | "negative" | "warning"

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary-container/20 text-secondary",
  positive: "bg-tertiary-container/30 text-tertiary",
  negative: "bg-error-container/40 text-error",
  warning: "bg-amber-500/15 text-amber-300",
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  icon?: string
  glow?: boolean
  className?: string
}

export function Badge({ children, tone = "neutral", icon, glow, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular ${TONES[tone]} ${glow && tone === "positive" ? "glow-tertiary" : ""} ${className}`}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}
