"use client"

import { usePathname } from "next/navigation"
import { Icon } from "@/components/ui/Icon"
import { Button } from "@/components/ui/Button"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Notifications } from "./Notifications"
import { navFor } from "./nav"

export function TopBar() {
  const pathname = usePathname()
  const nav = navFor(pathname)
  const { hidden, toggleHidden, syncAndCategorize, syncing, lastUpdated } = useFinance()

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-8">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{nav.title}</h1>
          <p className="truncate text-xs text-on-surface-variant">{nav.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && !syncing && (
            <span className="mr-2 hidden text-xs text-on-surface-variant xl:inline">
              Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {syncing && <span className="mr-2 text-xs text-secondary">{syncing}</span>}
          <button
            type="button"
            onClick={toggleHidden}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
            title={hidden ? "Show balances" : "Hide balances"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <Icon name={hidden ? "visibility_off" : "visibility"} size={22} />
          </button>
          <Notifications />
          <Button variant="primary" icon="sync" loading={!!syncing} onClick={syncAndCategorize} className="ml-1">
            Sync
          </Button>
        </div>
      </div>
    </header>
  )
}
