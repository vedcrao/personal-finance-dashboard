"use client"

import { useId, useMemo, useState } from "react"

/* Smooth path through points using Catmull-Rom → cubic Bézier */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ""
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

function project(values: number[], w: number, h: number, pad = 8): [number, number][] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((v, i) => [
    values.length === 1 ? w : (i / (values.length - 1)) * w,
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ])
}

const COLORS = { tertiary: "#4edea3", secondary: "#4cd7f6", error: "#ffb4ab", primary: "#c0c1ff" }

export function Sparkline({ points, color = "tertiary" }: { points: number[]; color?: keyof typeof COLORS }) {
  const id = useId()
  const W = 300
  const H = 100
  const pts = project(points, W, H)
  const line = smoothPath(pts)
  const stroke = COLORS[color]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${W},${H} L 0,${H} Z`} fill={`url(#${id}-f)`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface Point { date: string; value: number }

interface AreaChartProps {
  data: Point[]
  color?: keyof typeof COLORS
  formatValue: (v: number) => string
  formatDate: (d: string) => string
  height?: number
}

/** Interactive glowing area chart (Stitch "Performance Chart"). Hover to scrub. */
export function AreaChart({ data, color = "tertiary", formatValue, formatDate, height = 280 }: AreaChartProps) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 1000
  const H = height
  const stroke = COLORS[color]

  const pts = useMemo(() => project(data.map((d) => d.value), W, H, 24), [data, H])
  const line = smoothPath(pts)

  const idx = hover ?? data.length - 1
  const active = pts[idx]

  const ticks = useMemo(() => {
    const n = Math.min(5, data.length)
    return Array.from({ length: n }, (_, i) => Math.round((i / Math.max(1, n - 1)) * (data.length - 1)))
  }, [data.length])

  return (
    <div className="relative">
      <div
        className="relative w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(x * (data.length - 1)))))
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Balance history chart">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.38" />
              <stop offset="65%" stopColor={stroke} stopOpacity="0.08" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0.2, 0.5, 0.8].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#303444" strokeOpacity="0.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${line} L ${W},${H} L 0,${H} Z`} fill={`url(#${id}-fill)`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="2.75" strokeLinecap="round" filter={`url(#${id}-glow)`} vectorEffect="non-scaling-stroke" />
          {hover !== null && active && (
            <line x1={active[0]} x2={active[0]} y1="0" y2={H} stroke={stroke} strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {active && (
          <>
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${(active[0] / W) * 100}%`, top: active[1], background: stroke, boxShadow: `0 0 12px ${stroke}` }}
            />
            {hover === null && (
              <span
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-30"
                style={{ left: `${(active[0] / W) * 100}%`, top: active[1], background: stroke }}
              />
            )}
            <div
              className="glass-raised pointer-events-none absolute -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-center"
              style={{ left: `clamp(60px, ${(active[0] / W) * 100}%, calc(100% - 60px))`, top: Math.max(0, active[1] - 58) }}
            >
              <p className="tabular text-sm font-semibold">{formatValue(data[idx].value)}</p>
              <p className="text-[10px] text-on-surface-variant">{formatDate(data[idx].date)}</p>
            </div>
          </>
        )}
      </div>
      <div className="mt-3 flex justify-between text-[11px] font-semibold text-on-surface-variant">
        {ticks.map((t, i) => (
          <span key={`${t}-${i}`} className={i === ticks.length - 1 ? "text-tertiary" : ""}>
            {i === ticks.length - 1 ? "Today" : formatDate(data[t].date)}
          </span>
        ))}
      </div>
    </div>
  )
}
