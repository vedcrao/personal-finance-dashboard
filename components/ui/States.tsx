import type { ReactNode } from "react"
import { Icon } from "./Icon"

export function EmptyState({ icon = "inbox", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
        <Icon name={icon} size={24} />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-on-surface-variant">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-container-high/70 ${className}`} />
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
        tone === "warning" ? "bg-amber-500/10 text-amber-200" : "bg-secondary-container/10 text-secondary"
      }`}
    >
      <Icon name={tone === "warning" ? "warning" : "info"} size={18} className="mt-px shrink-0" />
      <div>{children}</div>
    </div>
  )
}
