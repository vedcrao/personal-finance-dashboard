import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid"
import { plaidClient } from "./plaid"
import { supabaseAdmin } from "./supabase-server"
import { TEST_USER_ID } from "./user"
import { isMissingSchema } from "./db-errors"
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

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

/**
 * mode "uncategorized" — only rows without a category (after a sync)
 * mode "all"           — re-run everything except rows you edited by hand
 */
export async function applyCategorization(mode: "uncategorized" | "all" = "uncategorized") {
  const { data: rules, error: rulesErr } = await supabaseAdmin
    .from("categorization_rules")
    .select("match, category, flow_override")
    .eq("user_id", TEST_USER_ID)
  if (isMissingSchema(rulesErr)) throw new Error(AUTOMATION_MIGRATION_HINT)

  const rows = await fetchAll<CategorizeInput>((from, to) => {
    let q = supabaseAdmin
      .from("transactions")
      .select("id, description, merchant_name, amount, city, country, raw_data")
      .eq("user_id", TEST_USER_ID)
    q = mode === "uncategorized" ? q.is("category", null) : q.or("category_source.is.null,category_source.neq.user")
    return q.order("id").range(from, to)
  })
  if (!rows.length) return { categorized: 0, llmUsed: 0 }

  const { results, llmUsed } = await categorize(rows, (rules ?? []) as Rule[])

  for (let i = 0; i < results.length; i += 50) {
    await Promise.all(
      results.slice(i, i + 50).map(({ id, ...r }) =>
        supabaseAdmin
          .from("transactions")
          .update({ ...r, flow_override: r.flow_override ?? null })
          .eq("id", id)
      )
    )
  }
  return { categorized: results.length, llmUsed }
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

async function accountMap(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from("accounts").select("id, plaid_account_id").eq("user_id", TEST_USER_ID)
  return new Map(data?.map((a) => [a.plaid_account_id, a.id]) ?? [])
}

function toRow(t: PlaidTransaction, accountId: string) {
  return {
    user_id: TEST_USER_ID,
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
export async function syncItem(item: ItemRow): Promise<ItemSyncResult> {
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
          const r = await plaidClient.transactionsSync({ access_token: item.plaid_access_token, cursor, count: 500 })
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
        user_id: TEST_USER_ID, plaid_account_id: a.account_id, plaid_item_id: item.plaid_item_id,
        name: a.name, type: a.type, subtype: a.subtype ?? null, mask: a.mask ?? null,
      })),
      { onConflict: "plaid_account_id", ignoreDuplicates: true }
    )
  }
  const accMap = await accountMap()

  const upserts = [...added, ...modified].filter((t) => accMap.has(t.account_id)).map((t) => toRow(t, accMap.get(t.account_id)!))
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
    const liab = await plaidClient.liabilitiesGet({ access_token: item.plaid_access_token })
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

async function loadItems(itemId?: string): Promise<ItemRow[]> {
  let q = supabaseAdmin
    .from("plaid_items")
    .select("plaid_access_token, plaid_item_id, institution_name, transactions_cursor")
    .eq("user_id", TEST_USER_ID)
  if (itemId) q = q.eq("plaid_item_id", itemId)
  const { data, error } = await q
  if (isMissingSchema(error)) throw new Error(AUTOMATION_MIGRATION_HINT)
  if (error) throw new Error(error.message)
  return (data ?? []) as ItemRow[]
}

/** Sync one Item (webhook) or all Items (button / cron), then categorize what's new. */
export async function syncAndCategorize(itemId?: string) {
  const items = await loadItems(itemId)
  const results: ItemSyncResult[] = []
  for (const item of items) results.push(await syncItem(item))
  const cat = await applyCategorization("uncategorized")
  return {
    items: results,
    synced: results.reduce((s, r) => s + r.added + r.modified, 0),
    removed: results.reduce((s, r) => s + r.removed, 0),
    categorized: cat.categorized,
    llmUsed: cat.llmUsed,
  }
}
