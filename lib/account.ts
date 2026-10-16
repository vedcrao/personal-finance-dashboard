import { supabaseAdmin } from "./supabase-server"
import { getPlaidClient, forgetPlaidClient } from "./plaid"

/** Child tables first (foreign keys), then the account itself. */
const USER_TABLES = ["transactions", "balance_snapshots", "savings_goals", "categorization_rules", "user_settings", "category_budgets", "accounts", "plaid_items", "plaid_credentials", "profiles"]

export interface DeletionReport {
  banksDisconnected: number
  bankErrors: string[]
}

/**
 * Permanently deletes a user (App Store guideline 5.1.1(v)):
 *  1. revokes every bank connection at Plaid (/item/remove), so no more data or billing
 *  2. deletes all their rows (transactions, accounts, rules, goals, snapshots, settings, keys, profile)
 *  3. deletes the Supabase Auth user
 */
export async function deleteUserCompletely(userId: string): Promise<DeletionReport> {
  const report: DeletionReport = { banksDisconnected: 0, bankErrors: [] }

  const { data: items } = await supabaseAdmin.from("plaid_items").select("plaid_access_token, institution_name").eq("user_id", userId)
  if (items?.length) {
    try {
      const plaid = await getPlaidClient(userId)
      for (const item of items) {
        try {
          await plaid.itemRemove({ access_token: item.plaid_access_token })
          report.banksDisconnected++
        } catch (e) {
          const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
          // Already removed / invalid token = nothing left to revoke
          if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") report.bankErrors.push(`${item.institution_name}: ${code ?? "failed"}`)
        }
      }
    } catch {
      report.bankErrors.push("Plaid keys unavailable; connections will expire on their own")
    }
  }

  for (const table of USER_TABLES) {
    const column = table === "profiles" ? "id" : "user_id"
    const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
    if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(`Couldn't delete ${table}: ${error.message}`)
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Couldn't delete login: ${error.message}`)
  forgetPlaidClient(userId)
  return report
}
