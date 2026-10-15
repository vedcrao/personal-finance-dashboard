"use client"

import { useFinance } from "@/components/providers/FinanceProvider"
import { P2P_CATEGORY } from "@/lib/categories"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { categoryStyle, flowLabel, flowOf, flowType, isMatchedRefund } from "@/lib/finance"
import { relativeDay, shortDate } from "@/lib/format"
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
  const refunded = isMatchedRefund(t)
  const zelle = t.category === P2P_CATEGORY
  const style = categoryStyle(zelle || refunded ? t.category : flow === "income" ? "Income" : t.category)
  const icon = flow === "outflow" || zelle || refunded ? style.icon : FLOW_ICON[flow]
  const iconClasses = zelle || refunded
    ? `${style.bg} ${style.text}`
    : flow === "income" ? "bg-tertiary/10 text-tertiary" : flow === "transfer" ? "bg-secondary/10 text-secondary" : `${style.bg} ${style.text}`

  return (
    <button
      type="button"
      onClick={() => editTransaction(t)}
      title="Edit category / how it counts"
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container-high/40 md:gap-4 md:px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
        <div className={`flex h-10 w-10 shrink-0 md:h-11 md:w-11 items-center justify-center rounded-xl ${iconClasses}`}>
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {t.merchant_name ?? t.description}
            {t.is_anomaly && <Icon name="gpp_maybe" size={14} className="ml-1.5 align-[-2px] text-amber-300" />}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="truncate">{showAccount ? account?.name ?? "—" : flow === "transfer" && !refunded ? "Transfer" : t.category ?? "Uncategorized"}
              {(counts === "reimbursement" || isMatchedRefund(t)) && ` · ${flowLabel(t).toLowerCase()}`}
              {t.reimburses && ` · ${t.reimburses.merchant.slice(0, 22)} ${shortDate(t.reimburses.date)}`}
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
          className={`text-sm font-semibold ${refunded ? "text-on-surface-variant line-through decoration-1" : flow === "income" ? "text-tertiary" : flow === "transfer" ? "text-secondary" : ""}`}
        />
        {/* Phones: no room for the account name; it's in the editor on tap */}
        <span className="hidden max-w-[11rem] truncate text-[11px] text-on-surface-variant md:block">
          {!showAccount && account ? `${account.name.slice(0, 18)}${account.mask ? ` •• ${account.mask}` : ""}` : t.city ?? ""}
        </span>
      </div>
    </button>
  )
}
