"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useFinance } from "@/components/providers/FinanceProvider"
import { Button, ButtonLink } from "@/components/ui/Button"
import { EmptyState, Skeleton } from "@/components/ui/States"
import { Panel } from "@/components/ui/Panel"

/** Handles first-load, error and "no banks connected yet" states for every page except /connect. */
export function DataGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { loading, error, hasData, lastUpdated, refresh } = useFinance()

  if (pathname.startsWith("/connect") || pathname.startsWith("/settings")) return <>{children}</>

  if (loading && !lastUpdated) {
    return (
      <div className="grid grid-cols-12 gap-6">
        <Skeleton className="col-span-12 h-44 xl:col-span-8" />
        <Skeleton className="col-span-12 h-44 xl:col-span-4" />
        <Skeleton className="col-span-12 h-80 xl:col-span-7" />
        <Skeleton className="col-span-12 h-80 xl:col-span-5" />
      </div>
    )
  }

  if (error && !hasData) {
    return (
      <Panel>
        <EmptyState icon="cloud_off" title="Couldn't load your data" action={<Button icon="refresh" onClick={refresh}>Try again</Button>}>
          {error}
        </EmptyState>
      </Panel>
    )
  }

  if (!hasData) {
    return (
      <Panel glow="primary">
        <EmptyState
          icon="account_balance"
          title="Connect your first account"
          action={<ButtonLink href="/connect" variant="primary" icon="link">Connect a bank</ButtonLink>}
        >
          Link your checking, savings, credit cards and brokerage accounts with Plaid to see your full picture here.
        </EmptyState>
      </Panel>
    )
  }

  return <>{children}</>
}
