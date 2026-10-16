import type { PlaidApi } from "plaid"

/** Minimal Plaid transaction shape the sync reads */
export interface FakeTxn {
  transaction_id: string
  account_id: string
  amount: number
  date: string
  name: string
  merchant_name?: string | null
  pending?: boolean
  personal_finance_category?: { primary: string; detailed: string; confidence_level: string }
}

/**
 * Scriptable stand-in for Plaid's /transactions/sync. Each call to `push()` queues a batch of
 * changes (added / modified / removed) that the next sync returns, paged by `pageSize` to
 * exercise has_more pagination. Liabilities/accounts are empty.
 */
export function fakePlaid(accounts: { account_id: string; name: string; type: string; subtype?: string; mask?: string }[], pageSize = 2) {
  const queue: { added: FakeTxn[]; modified: FakeTxn[]; removed: { transaction_id: string }[] }[] = []
  let cursor = 0
  const calls: string[] = []

  const client = {
    async transactionsSync(req: { cursor?: string }) {
      calls.push(`sync:${req.cursor ?? "∅"}`)
      const pending = queue[0] ?? { added: [], modified: [], removed: [] }
      const take = <T,>(arr: T[]) => arr.splice(0, pageSize)
      const page = { added: take(pending.added), modified: take(pending.modified), removed: take(pending.removed) }
      const empty = !pending.added.length && !pending.modified.length && !pending.removed.length
      if (empty) queue.shift()
      const hasMore = !empty
      cursor++
      const toPlaid = (t: FakeTxn) => ({
        ...t, merchant_name: t.merchant_name ?? null, pending: t.pending ?? false, location: {},
        personal_finance_category: t.personal_finance_category ?? { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", confidence_level: "HIGH" },
      })
      return { data: { added: page.added.map(toPlaid), modified: page.modified.map(toPlaid), removed: page.removed, accounts, has_more: hasMore, next_cursor: `c${cursor}` } }
    },
    async liabilitiesGet() { throw Object.assign(new Error("no liabilities"), { response: { data: { error_code: "PRODUCTS_NOT_SUPPORTED" } } }) },
    async itemRemove() { return { data: {} } },
    async accountsGet() { return { data: { accounts: accounts.map((a) => ({ ...a, balances: { current: 1000, available: 1000, limit: null, iso_currency_code: "USD" } })) } } },
  }

  return {
    client: client as unknown as PlaidApi,
    push(batch: Partial<{ added: FakeTxn[]; modified: FakeTxn[]; removed: { transaction_id: string }[] }>) {
      queue.push({ added: [...(batch.added ?? [])], modified: [...(batch.modified ?? [])], removed: [...(batch.removed ?? [])] })
    },
    calls,
  }
}
