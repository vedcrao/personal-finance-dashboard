import Link from "next/link"
import type { ReactNode } from "react"
import { Icon } from "@/components/ui/Icon"
import { LEGAL } from "@/lib/legal"

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)] md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-brand to-secondary-container">
              <Icon name="change_history" size={20} filled className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">{LEGAL.appName}</span>
          </Link>
          <nav className="flex gap-4 text-xs font-semibold text-on-surface-variant">
            <Link href="/privacy" className="hover:text-on-surface">Privacy</Link>
            <Link href="/terms" className="hover:text-on-surface">Terms</Link>
            <Link href="/support" className="hover:text-on-surface">Support</Link>
          </nav>
        </div>
        <article className="glass rounded-2xl p-6 md:p-10">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-1 text-xs text-on-surface-variant">Effective {LEGAL.effectiveDate}</p>
          <div className="legal mt-6 space-y-4 text-sm leading-relaxed text-on-surface-variant">{children}</div>
        </article>
      </div>
    </main>
  )
}

export function H({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-base font-semibold text-on-surface">{children}</h2>
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
}
