import type { ReactNode } from "react"
import { Icon } from "./Icon"

interface PanelProps {
  title?: ReactNode
  icon?: string
  iconClass?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Decorative blurred glow blobs, like the Stitch hero cards */
  glow?: "primary" | "secondary" | "tertiary"
  padded?: boolean
}

const GLOW: Record<NonNullable<PanelProps["glow"]>, [string, string]> = {
  primary: ["bg-primary/10", "bg-secondary/10"],
  secondary: ["bg-secondary-container/10", "bg-tertiary-container/10"],
  tertiary: ["bg-tertiary/10", "bg-primary/5"],
}

export function Panel({
  title, icon, iconClass = "text-secondary", action, children, className = "", bodyClassName = "", glow, padded = true,
}: PanelProps) {
  return (
    <section className={`glass relative overflow-hidden rounded-2xl shadow-xl shadow-black/20 ${className}`}>
      {glow && (
        <>
          <div className={`pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl ${GLOW[glow][0]}`} />
          <div className={`pointer-events-none absolute -bottom-14 -left-14 h-40 w-40 rounded-full blur-3xl ${GLOW[glow][1]}`} />
        </>
      )}
      {(title || action) && (
        <header className={`relative flex flex-wrap items-center justify-between gap-3 ${padded ? "px-4 pt-4 md:px-6 md:pt-5" : "px-4 py-3 md:px-6 md:py-4 border-b border-white/5"}`}>
          <div className="flex min-w-0 items-center gap-2">
            {icon && <Icon name={icon} size={20} className={iconClass} />}
            {typeof title === "string" ? <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2> : title}
          </div>
          {action}
        </header>
      )}
      <div className={`relative ${padded ? "p-4 md:p-6" : ""} ${title && padded ? "pt-4" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant ${className}`}>{children}</p>
}
