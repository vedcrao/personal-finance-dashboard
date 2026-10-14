import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { plaidClient } from "@/lib/plaid"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema } from "@/lib/db-errors"
import { ymd } from "@/lib/finance"
import type { Holding } from "@/lib/types"

const BASE_COLUMNS = "id, name, type, subtype, mask, plaid_item_id, plaid_account_id, billing_cycle_day"

interface DbAccount {
  id: string
  name: string
  type: string
  subtype: string | null
  mask: string | null
  plaid_item_id: string
  plaid_account_id: string
  billing_cycle_day: number | null
  apy?: number | null
}

async function loadAccounts(): Promise<{ data: DbAccount[] | null; error: { message: string } | null }> {
  const withApy = await supabaseAdmin
    .from("accounts")
    .select(`${BASE_COLUMNS}, apy`)
    .eq("user_id", TEST_USER_ID)
    .order("type", { ascending: true })
  if (!isMissingSchema(withApy.error)) return withApy

  // Migration not applied yet — fall back to the original columns.
  return supabaseAdmin
    .from("accounts")
    .select(BASE_COLUMNS)
    .eq("user_id", TEST_USER_ID)
    .order("type", { ascending: true })
}

export async function GET() {
  const { data, error } = await loadAccounts()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: items } = await supabaseAdmin
    .from("plaid_items")
    .select("plaid_item_id, institution_name, plaid_access_token")
    .eq("user_id", TEST_USER_ID)

  const itemMap = new Map(items?.map((i) => [i.plaid_item_id, i.institution_name]) ?? [])

  const balanceMap = new Map<string, { current: number | null; available: number | null; limit: number | null; currency: string | null }>()
  const holdingsMap = new Map<string, Holding[]>()

  if (items?.length) {
    await Promise.all(
      items.map(async (item) => {
        try {
          const accRes = await plaidClient.accountsGet({ access_token: item.plaid_access_token })
          for (const acc of accRes.data.accounts) {
            balanceMap.set(acc.account_id, {
              current: acc.balances.current ?? null,
              available: acc.balances.available ?? null,
              limit: acc.balances.limit ?? null,
              currency: acc.balances.iso_currency_code ?? "USD",
            })
          }
        } catch (err: unknown) {
          console.warn(`Failed to fetch balances for ${item.institution_name}:`, err instanceof Error ? err.message : err)
        }

        try {
          const holdRes = await plaidClient.investmentsHoldingsGet({ access_token: item.plaid_access_token })
          const securityMap = new Map(holdRes.data.securities.map((s) => [s.security_id, s]))
          for (const h of holdRes.data.holdings) {
            const sec = securityMap.get(h.security_id)
            const list = holdingsMap.get(h.account_id) ?? []
            list.push({
              name: sec?.name ?? "Unknown Security",
              symbol: sec?.ticker_symbol ?? null,
              quantity: h.quantity,
              price: h.institution_price,
              value: h.institution_value,
              cost_basis: h.cost_basis ?? null,
              security_type: sec?.type ?? null,
              sector: sec?.sector ?? null,
              industry: sec?.industry ?? null,
              price_as_of: h.institution_price_as_of ?? sec?.close_price_as_of ?? null,
            })
            holdingsMap.set(h.account_id, list)
          }
        } catch {
          // Investments not enabled / supported for this item
        }
      })
    )
  }

  const accounts = (data ?? []).map((a) => {
    const bal = balanceMap.get(a.plaid_account_id)
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      mask: a.mask,
      plaid_item_id: a.plaid_item_id,
      billing_cycle_day: a.billing_cycle_day,
      apy: a.apy ?? null,
      institution_name: itemMap.get(a.plaid_item_id) ?? "Unknown",
      current_balance: bal?.current ?? null,
      available_balance: bal?.available ?? null,
      credit_limit: bal?.limit ?? null,
      currency: bal?.currency ?? "USD",
      holdings: holdingsMap.get(a.plaid_account_id) ?? [],
    }
  })

  // Record today's balances so history charts fill in over time. Best-effort.
  const today = ymd(new Date())
  const snapshots = accounts
    .filter((a) => a.current_balance !== null)
    .map((a) => ({
      user_id: TEST_USER_ID,
      account_id: a.id,
      account_type: a.type,
      date: today,
      current_balance: a.current_balance,
    }))
  if (snapshots.length) {
    const { error: snapErr } = await supabaseAdmin
      .from("balance_snapshots")
      .upsert(snapshots, { onConflict: "account_id,date" })
    if (snapErr && !isMissingSchema(snapErr)) console.warn("Snapshot write failed:", snapErr.message)
  }

  return NextResponse.json({ accounts })
}
