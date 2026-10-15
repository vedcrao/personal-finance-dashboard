import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid"
import { getPlaidClient } from "./plaid"
import type { PlaidApi } from "plaid"
import { supabaseAdmin } from "./supabase-server"
import { isMissingSchema } from "./db-errors"
import { markInternalTransfers } from "./transfers"
import { categorize, type CategorizeInput, type Rule } from "./categorize"

export const AUTOMATION_MIGRATION_HINT =
  "Run supabase/migrations/20261015_automation.sql in the Supabase SQL editor to enable automatic sync."

interface ItemRow {
  plaid_access_token: string
  plaid_item_id: string
  institution_name: string
  transactions_cursor: string | null
}

export interface ItemSyncResult {
  institution: string
  added: number
  modified: number
  removed: number
  error?: string
}

function plaidErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
}

/* ------------------------------------------------------------------ */
/* Categorization (shared by sync, the categorize route and webhooks)  */
/* ------------------------------------------------------------------ */

export const RULES_MIGRATION_HINT =
  "Run supabase/migrations/20261016_rules_v2.sql in the Supabase SQL editor to enable smart rules."

export async function loadRules(userId: string): Promise<Rule[]> {
  const { data, error } = await supabaseAdmin.from("categorization_rules").select("*").eq("user_id", userId)
  if (isMissingSchema(error)) throw new Error(AUTOMATION_MIGRATION_HINT)
  if (error) throw new Error(error.message)
  return (data ?? []) as Rule[]
}

export interface CategorizeProgress {
  categorized: number
  llmUsed: number
  /** Rows still waiting; call again (passing `since`) until 0 */
  remaining: number
  /** Run id for mode "all" — rows stamped before this get re-processed */
  since: string
}

/**
 * Resumable, time-boxed categorization so no single request can time out.
 *   mode "uncategorized" — rows without a category (after a sync)
 *   mode "all"           — everything you haven't edited by hand; pass the returned
 *                          `since` back on each follow-up call to continue the same run
 */
export async function applyCategorization(
  userId: string,
  mode: "uncategorized" | "all" = "uncategorized",
  opts: { since?: string; budgetMs?: number; chunk?: number } = {}
): Promise<CategorizeProgress> {
  const since = opts.since ?? new Date().toISOString()
  const budget = opts.budgetMs ?? 40_000
  const chunk = opts.chunk ?? 200
  const started = Date.now()
  const rules = await loadRules(userId)

  const pending = (select: string, head = false) => {
    let q = supabaseAdmin
      .from("transactions")
      .select(select, head ? { count: "exact", head: true } : undefined)
      .eq("user_id", userId)
    if (mode === "uncategorized") q = q.is("category", null)
    // (not hand-edited) AND (not yet processed in this run)
    else q = q.or(`and(or(category_source.is.null,category_source.neq.user),or(categorized_at.is.null,categorized_at.lt."${since}"))`)
    return q
  }

  let categorized = 0
  let llmUsed = 0
  while (Date.now() - started < budget) {
    const { data, error } = await pending("id, description, merchant_name, amount, city, country, raw_data").order("id").limit(chunk)
    if (isMissingSchema(error)) throw new Error(RULES_MIGRATION_HINT)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as CategorizeInput[]
    if (!rows.length) break

    const out = await categorize(rows, rules)
    const now = new Date().toISOString()
    for (let i = 0; i < out.results.length; i += 50) {
      const res = await Promise.all(
        out.results.slice(i, i + 50).map(({ id, ...r }) =>
          supabaseAdmin.from("transactions").update({ ...r, flow_override: r.flow_override ?? null, categorized_at: now }).eq("id", id)
        )
      )
      const failed = res.find((r) => r.error)?.error
      if (isMissingSchema(failed)) throw new Error(RULES_MIGRATION_HINT)
      if (failed) throw new Error(failed.message)
    }
    categorized += out.results.length
    llmUsed += out.llmUsed
    if (rows.length < chunk) break
  }

  const { count } = await pending("id", true)
  // After the last chunk, pair up money moved between your own accounts (savings → checking,
  // card autopays) so it isn't counted as spending + income
  if ((count ?? 0) === 0) await markInternalTransfers(userId)
  return { categorized, llmUsed, remaining: count ?? 0, since }
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

async function accountMap(userId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from("accounts").select("id, plaid_account_id").eq("user_id", userId)
  return new Map(data?.map((a) => [a.plaid_account_id, a.id]) ?? [])
}

function toRow(t: PlaidTransaction, accountId: string, userId: string) {
  return {
    user_id: userId,
    account_id: accountId,
    plaid_transaction_id: t.transaction_id,
    amount: t.amount,
    merchant_name: t.merchant_name ?? null,
    description: t.name,
    date: t.date,
    pending: t.pending,
    city: t.location?.city ?? null,
    region: t.location?.region ?? null,
    country: t.location?.country ?? null,
    raw_data: t,
  }
}

/** Pull every change since the stored cursor for one Item. */
export async function syncItem(userId: string, plaid: PlaidApi, item: ItemRow): Promise<ItemSyncResult> {
  const result: ItemSyncResult = { institution: item.institution_name, added: 0, modified: 0, removed: 0 }

  let added: PlaidTransaction[] = []
  let modified: PlaidTransaction[] = []
  let removed: RemovedTransaction[] = []
  let cursor = item.transactions_cursor ?? undefined
  let accounts: { account_id: string; name: string; type: string; subtype?: string | null; mask?: string | null }[] = []

  try {
    // Paginate; restart from the original cursor if Plaid mutates mid-pagination
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        added = []; modified = []; removed = []
        cursor = item.transactions_cursor ?? undefined
        let hasMore = true
        while (hasMore) {
          const r = await plaid.transactionsSync({ access_token: item.plaid_access_token, cursor, count: 500 })
          added.push(...r.data.added)
          modified.push(...r.data.modified)
          removed.push(...r.data.removed)
          accounts = r.data.accounts ?? accounts
          hasMore = r.data.has_more
          cursor = r.data.next_cursor
        }
        break
      } catch (e) {
        if (plaidErrorCode(e) !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 2) throw e
      }
    }
  } catch (e) {
    const code = plaidErrorCode(e)
    const status = code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error"
    await supabaseAdmin.from("plaid_items").update({ status, status_detail: code ?? String(e) }).eq("plaid_item_id", item.plaid_item_id)
    return { ...result, error: code ?? (e instanceof Error ? e.message : "Sync failed") }
  }

  // New accounts can appear on an existing Item (e.g. a newly opened card)
  if (accounts.length) {
    await supabaseAdmin.from("accounts").upsert(
      accounts.map((a) => ({
        user_id: userId, plaid_account_id: a.account_id, plaid_item_id: item.plaid_item_id,
        name: a.name, type: a.type, subtype: a.subtype ?? null, mask: a.mask ?? null,
      })),
      { onConflict: "plaid_account_id", ignoreDuplicates: true }
    )
  }
  const accMap = await accountMap(userId)

  const upserts = [...added, ...modified].filter((t) => accMap.has(t.account_id)).map((t) => toRow(t, accMap.get(t.account_id)!, userId))
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await supabaseAdmin.from("transactions").upsert(upserts.slice(i, i + 500), { onConflict: "plaid_transaction_id" })
    if (error) return { ...result, error: error.message }
  }

  const removedIds = removed.map((r) => r.transaction_id).filter(Boolean) as string[]
  if (removedIds.length) await supabaseAdmin.from("transactions").delete().in("plaid_transaction_id", removedIds)

  await supabaseAdmin
    .from("plaid_items")
    .update({ transactions_cursor: cursor, last_synced_at: new Date().toISOString(), status: "ok", status_detail: null })
    .eq("plaid_item_id", item.plaid_item_id)

  // Statement closing day from Liabilities (credit cards), when available
  try {
    const liab = await plaid.liabilitiesGet({ access_token: item.plaid_access_token })
    for (const card of liab.data.liabilities.credit ?? []) {
      const id = card.account_id ? accMap.get(card.account_id) : undefined
      if (!id || !card.last_statement_issue_date) continue
      await supabaseAdmin.from("accounts").update({ billing_cycle_day: new Date(card.last_statement_issue_date).getUTCDate() }).eq("id", id)
    }
  } catch {
    // Liabilities not enabled for this Item
  }

  return { ...result, added: added.length, modified: modified.length, removed: removedIds.length }
}

async function loadItems(userId: string, itemId?: string): Promise<ItemRow[]> {
  let q = supabaseAdmin
    .from("plaid_items")
    .select("plaid_access_token, plaid_item_id, institution_name, transactions_cursor")
    .eq("user_id", userId)
  if (itemId) q = q.eq("plaid_item_id", itemId)
  const { data, error } = await q
  if (isMissingSchema(error)) throw new Error(AUTOMATION_MIGRATION_HINT)
  if (error) throw new Error(error.message)
  return (data ?? []) as ItemRow[]
}

/** Sync one Item (webhook) or all Items (button / cron), then categorize what's new. */
export async function syncAndCategorize(userId: string, itemId?: string, opts: { budgetMs?: number } = {}) {
  const items = await loadItems(userId, itemId)
  const plaid = await getPlaidClient(userId)
  const results: ItemSyncResult[] = []
  for (const item of items) results.push(await syncItem(userId, plaid, item))
  const cat = await applyCategorization(userId, "uncategorized", { budgetMs: opts.budgetMs ?? 25_000 })
  return {
    items: results,
    synced: results.reduce((s, r) => s + r.added + r.modified, 0),
    removed: results.reduce((s, r) => s + r.removed, 0),
    categorized: cat.categorized,
    llmUsed: cat.llmUsed,
    remaining: cat.remaining,
  }
}
