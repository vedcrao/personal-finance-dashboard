interface ProgressBarProps {
  value: number // 0–100 (clamped)
  /** Tailwind classes for the fill */
  fill?: string
  track?: string
  height?: "xs" | "sm" | "md"
  glow?: boolean
  className?: string
  label?: string
}

const HEIGHTS = { xs: "h-1.5", sm: "h-2", md: "h-3" }

export function ProgressBar({
  value, fill = "bg-gradient-to-r from-secondary to-primary", track = "bg-surface-container-highest", height = "sm", glow, className = "", label,
}: ProgressBarProps) {
  const w = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full ${track} ${HEIGHTS[height]} ${className}`}
    >
      <div className={`h-full rounded-full transition-all duration-700 ${fill} ${glow ? "glow-secondary" : ""}`} style={{ width: `${w}%` }} />
    </div>
  )
}
