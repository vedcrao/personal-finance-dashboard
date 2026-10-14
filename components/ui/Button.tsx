import Link from "next/link"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Icon } from "./Icon"

type Variant = "primary" | "secondary" | "ghost" | "danger"

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-indigo-brand to-[#4F46E5] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:glow-primary hover:brightness-110",
  secondary: "border border-white/[0.08] bg-white/[0.04] text-on-surface hover:bg-white/[0.08]",
  ghost: "text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface",
  danger: "border border-error/20 bg-error-container/20 text-error hover:bg-error-container/40",
}

const SIZES = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2" }

interface Common {
  variant?: Variant
  size?: keyof typeof SIZES
  icon?: string
  loading?: boolean
  children?: ReactNode
  className?: string
}

export function Button({
  variant = "secondary", size = "md", icon, loading, children, className = "", disabled, ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-full font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Icon name="progress_activity" size={size === "sm" ? 16 : 18} className="animate-spin" /> : icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </button>
  )
}

export function ButtonLink({ href, variant = "secondary", size = "md", icon, children, className = "" }: Common & { href: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full font-semibold transition-all ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </Link>
  )
}
