"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Icon } from "@/components/ui/Icon"
import { useFinance } from "@/components/providers/FinanceProvider"

const TILE =
  "group flex flex-col items-start gap-3 rounded-2xl glass p-4 text-left transition-all hover:bg-surface-container-high/60 active:scale-[0.98] disabled:opacity-50"

function Tile({ icon, gradient, label, hint, busy }: { icon: string; gradient: string; label: string; hint: string; busy?: boolean }) {
  return (
    <>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br transition-transform group-hover:scale-105 ${gradient}`}>
        <Icon name={busy ? "progress_activity" : icon} size={22} className={busy ? "animate-spin" : ""} />
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-on-surface-variant">{hint}</p>
      </div>
    </>
  )
}

/** Desktop version of the Stitch quick-action matrix, mapped to things this app can actually do. */
export function QuickActions() {
  const { syncAndCategorize, syncing, sendDigest, sendingDigest, me } = useFinance()

  const items: ReactNode[] = [
    <button key="sync" type="button" className={TILE} onClick={syncAndCategorize} disabled={!!syncing}>
      <Tile icon="sync" busy={!!syncing} label="Sync & categorize" hint="Pull new transactions, AI-tag them"
        gradient="from-primary-container/40 to-primary/20 text-primary-fixed shadow-[0_2px_12px_rgba(128,131,255,0.25)]" />
    </button>,
    me?.owner ? (
      <button key="digest" type="button" className={TILE} onClick={sendDigest} disabled={sendingDigest}>
        <Tile icon="sms" busy={sendingDigest} label="Text me a digest" hint="AI weekly summary by SMS"
          gradient="from-secondary-container/40 to-secondary/20 text-secondary-fixed shadow-[0_2px_12px_rgba(3,181,211,0.25)]" />
      </button>
    ) : (
      <Link key="assistant" href="/assistant" className={TILE}>
        <Tile icon="auto_awesome" label="Ask the assistant" hint="Rules & spending questions"
          gradient="from-secondary-container/40 to-secondary/20 text-secondary-fixed shadow-[0_2px_12px_rgba(3,181,211,0.25)]" />
      </Link>
    ),
    <Link key="recurring" href="/transactions?tab=recurring" className={TILE}>
      <Tile icon="autorenew" label="Recurring bills" hint="Subscriptions & repeat charges"
        gradient="from-tertiary-container/40 to-tertiary/20 text-tertiary-fixed shadow-[0_2px_12px_rgba(78,222,163,0.25)]" />
    </Link>,
    <Link key="connect" href="/connect" className={TILE}>
      <Tile icon="add_link" label="Connect a bank" hint="Add another institution"
        gradient="from-surface-container-highest to-surface-bright text-on-surface shadow-[0_2px_12px_rgba(0,0,0,0.3)]" />
    </Link>,
  ]

  return <div className="grid h-full grid-cols-2 gap-4">{items}</div>
}
