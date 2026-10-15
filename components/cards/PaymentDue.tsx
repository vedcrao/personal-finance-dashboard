import { Panel } from "@/components/ui/Panel"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { Icon } from "@/components/ui/Icon"
import { Money } from "@/components/ui/Money"
import { Notice } from "@/components/ui/States"
import { daysUntil } from "@/lib/finance"
import { longDate, shortDate } from "@/lib/format"
import type { Account, CreditLiability } from "@/lib/types"

const APR_LABELS: Record<string, string> = {
  purchase_apr: "Purchase",
  balance_transfer_apr: "Balance transfer",
  cash_apr: "Cash advance",
  special: "Promo",
}

export function PaymentDue({ account, liability }: { account: Account; liability: CreditLiability | undefined }) {
  const due = liability?.next_payment_due_date
  const days = due ? daysUntil(due) : null
  const paidSinceStatement =
    liability?.last_payment_date && liability.last_statement_issue_date && liability.last_payment_date >= liability.last_statement_issue_date

  let dueBadge = null
  if (liability?.is_overdue) dueBadge = <Badge tone="negative" icon="error">Overdue</Badge>
  else if (paidSinceStatement) dueBadge = <Badge tone="positive" icon="check_circle">Paid</Badge>
  else if (days !== null && days >= 0) dueBadge = <Badge tone={days <= 7 ? "negative" : "neutral"}>in {days} {days === 1 ? "day" : "days"}</Badge>

  return (
    <Panel className="h-full" bodyClassName="flex h-full flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container/20 text-secondary">
            <Icon name="event_upcoming" size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="whitespace-nowrap text-lg font-semibold">Payment Due</h2>
              {dueBadge}
            </div>
            <p className="text-sm text-on-surface-variant">{due ? `Due ${longDate(due)}` : "Due date unavailable"}</p>
          </div>
        </div>
        {liability?.last_payment_date && (
          <div className="flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-surface-container-high px-3 py-1 text-[11px] font-semibold text-tertiary">
            <Icon name="history" size={16} />
            Last paid <Money value={liability.last_payment_amount ?? 0} cents={false} /> · {shortDate(liability.last_payment_date)}
          </div>
        )}
      </div>

      {!liability ? (
        <Notice>
          Statement details come from Plaid Liabilities. Reconnect {account.institution_name} from the Connect page if this card was linked before Liabilities was enabled.
        </Notice>
      ) : (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-container-lowest p-3 md:gap-3 md:p-4">
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant">Statement balance</p>
            <Money value={liability.last_statement_balance ?? 0} className="mt-0.5 block text-base font-bold md:text-lg" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant">Minimum due</p>
            <Money value={liability.minimum_payment_amount ?? 0} className="mt-0.5 block text-base font-bold md:text-lg" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant">Current balance</p>
            <Money value={account.current_balance ?? 0} className="mt-0.5 block text-base font-bold md:text-lg" />
          </div>
        </div>
      )}

      {liability && liability.aprs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {liability.aprs.map((a) => (
            <Badge key={a.apr_type} tone="neutral">{APR_LABELS[a.apr_type] ?? a.apr_type} APR {a.apr_percentage.toFixed(2)}%</Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <ButtonLink href={`/transactions?account=${account.id}&view=statement`} variant="primary" icon="receipt_long" className="flex-1">
          Statement transactions
        </ButtonLink>
        <ButtonLink href={`/transactions?account=${account.id}`} icon="list">All activity</ButtonLink>
      </div>
    </Panel>
  )
}
