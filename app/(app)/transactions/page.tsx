"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { TransactionsView } from "@/components/transactions/TransactionsView"
import { Skeleton } from "@/components/ui/States"

function WithParams() {
  const sp = useSearchParams()
  const initial = {
    account: sp.get("account"),
    tab: sp.get("tab") === "recurring" ? ("recurring" as const) : ("transactions" as const),
    view: sp.get("view") === "statement" ? ("statement" as const) : ("month" as const),
    month: sp.get("month"),
    category: sp.get("category"),
  }
  // Remount when the URL changes (e.g. clicking a category link from another page)
  return <TransactionsView key={sp.toString()} initial={initial} />
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <WithParams />
    </Suspense>
  )
}
