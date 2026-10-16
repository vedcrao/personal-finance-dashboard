import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** Real Supabase, throwaway user. Requires .env.local (loaded by the npm script). */
export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, key, { auth: { persistSession: false } })
}

export interface TestUser {
  id: string
  email: string
  itemId: string
  accounts: { checking: string; savings: string; card: string; brokerage: string }
  plaidAccountIds: { checking: string; savings: string; card: string; brokerage: string }
  cleanup: () => Promise<void>
}

/** Creates an auth user + profile + one fake bank "item" with 4 accounts. */
export async function createTestUser(label = "it"): Promise<TestUser> {
  const sb = admin()
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const email = `vertice-test-${label}-${stamp}@example.com`
  const { data, error } = await sb.auth.admin.createUser({ email, password: `Test-${stamp}-pw!`, email_confirm: true })
  if (error) throw error
  const id = data.user.id
  await sb.from("profiles").insert({ id, username: `t${stamp}`.slice(0, 24), email })
  const itemId = `test-item-${stamp}`
  await sb.from("plaid_items").insert({ user_id: id, plaid_item_id: itemId, plaid_access_token: `access-test-${stamp}`, institution_name: "Test Bank" })
  const plaidAccountIds = { checking: `pa-chk-${stamp}`, savings: `pa-sav-${stamp}`, card: `pa-card-${stamp}`, brokerage: `pa-brk-${stamp}` }
  const defs = [
    { key: "checking", type: "depository", subtype: "checking", mask: "1111" },
    { key: "savings", type: "depository", subtype: "savings", mask: "2222" },
    { key: "card", type: "credit", subtype: "credit card", mask: "3333" },
    { key: "brokerage", type: "investment", subtype: "brokerage", mask: "4444" },
  ] as const
  const accounts = {} as TestUser["accounts"]
  for (const d of defs) {
    const { data: a, error: e } = await sb.from("accounts").insert({
      user_id: id, plaid_item_id: itemId, plaid_account_id: plaidAccountIds[d.key], name: `Test ${d.key}`, type: d.type, subtype: d.subtype, mask: d.mask,
    }).select("id").single()
    if (e) throw e
    accounts[d.key] = a.id
  }
  return {
    id, email, itemId, accounts, plaidAccountIds,
    async cleanup() {
      const { deleteUserCompletely } = await import("@/lib/account")
      await deleteUserCompletely(id).catch(async () => { await sb.auth.admin.deleteUser(id) })
    },
  }
}

export async function transactionsOf(userId: string) {
  const { data, error } = await admin().from("transactions").select("*, reimburses:raw_data->vertice_reimburses").eq("user_id", userId).order("date")
  if (error) throw error
  return data as (Record<string, unknown> & { id: string; plaid_transaction_id: string; amount: number; date: string; category: string | null; category_source: string | null; flow_override: string | null; pending: boolean; description: string })[]
}
