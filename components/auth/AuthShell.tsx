import type { ReactNode } from "react"
import { Icon } from "@/components/ui/Icon"

export const AUTH_INPUT =
  "h-11 w-full rounded-lg border bg-surface-container-lowest px-3 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-brand focus:ring-2 focus:ring-indigo-brand/25"

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      {children}
      {error ? <span className="text-xs text-error">{error}</span> : hint ? <span className="text-[11px] text-on-surface-variant">{hint}</span> : null}
    </label>
  )
}

export function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="relative flex min-h-screen items-start justify-center overflow-hidden bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] md:items-center md:py-10">
      <div className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-indigo-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-secondary/10 blur-3xl" />
      <div className={`relative w-full ${wide ? "max-w-5xl" : "max-w-sm"}`}>
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-brand to-secondary-container glow-primary">
            <Icon name="change_history" size={22} filled className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">Vertice</span>
        </div>
        {children}
      </div>
    </main>
  )
}
