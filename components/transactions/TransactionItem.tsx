"use client"

import { useFinance } from "@/components/providers/FinanceProvider"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { categoryStyle, flowOf, flowType } from "@/lib/finance"
import { relativeDay } from "@/lib/format"
import type { Account, Transaction } from "@/lib/types"

interface Props {
  t: Transaction
  account?: Account
  /** Show the account name instead of the category in the subtitle */
  showAccount?: boolean
}

const FLOW_ICON = { income: "south_west", transfer: "sync_alt", outflow: "" }

/** List-style transaction row (Stitch "Recent Activity" pattern). */
export function TransactionItem({ t, account, showAccount }: Props) {
  const { editTransaction } = useFinance()
  const counts = flowOf(t)
  const flow = flowType(t)
  const zelle = t.category === "Zelle"
  const style = categoryStyle(zelle ? "Zelle" : flow === "income" ? "Income" : t.category)
  const icon = flow === "outflow" || zelle ? style.icon : FLOW_ICON[flow]
  const iconClasses = zelle
    ? `${style.bg} ${style.text}`
    : flow === "income" ? "bg-tertiary/10 text-tertiary" : flow === "transfer" ? "bg-secondary/10 text-secondary" : `${style.bg} ${style.text}`

  return (
    <button
      type="button"
      onClick={() => editTransaction(t)}
      title="Edit category / how it counts"
      className="flex w-full items-center justify-between gap-4 px-6 py-3.5 text-left transition-colors hover:bg-surface-container-high/40"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClasses}`}>
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {t.merchant_name ?? t.description}
            {t.is_anomaly && <Icon name="gpp_maybe" size={14} className="ml-1.5 align-[-2px] text-amber-300" />}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="truncate">{showAccount ? account?.name ?? "—" : flow === "transfer" ? "Transfer" : t.category ?? "Uncategorized"}
              {counts === "reimbursement" && " · reimbursement"}
              {t.pending && " · pending"}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-outline" />
            <span className="shrink-0">{relativeDay(t.date)}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Money
          value={-t.amount}
          sign
          className={`text-sm font-semibold ${flow === "income" ? "text-tertiary" : flow === "transfer" ? "text-secondary" : ""}`}
        />
        <span className="text-[11px] text-on-surface-variant">
          {!showAccount && account ? `${account.name.slice(0, 18)}${account.mask ? ` •• ${account.mask}` : ""}` : t.city ?? ""}
        </span>
      </div>
    </button>
  )
}
