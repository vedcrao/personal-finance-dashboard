import { supabaseAdmin } from "./supabase-server"
import { LEGACY_USER_ID, isOwner } from "./user"

const TABLES = ["plaid_items", "accounts", "transactions", "user_settings", "savings_goals", "balance_snapshots", "categorization_rules"]

/**
 * One-time move of the pre-accounts data (stored under LEGACY_USER_ID) to the owner's
 * real Supabase user. Runs only after a verified sign-in, and only for LEGACY_OWNER_EMAIL,
 * so nobody else can claim it by signing up with your address.
 */
export async function claimLegacyData(user: { id: string; email: string }): Promise<number> {
  if (!isOwner(user.email) || user.id === LEGACY_USER_ID) return 0

  const { count } = await supabaseAdmin.from("plaid_items").select("*", { count: "exact", head: true }).eq("user_id", LEGACY_USER_ID)
  const { count: txCount } = await supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }).eq("user_id", LEGACY_USER_ID)
  if (!count && !txCount) return 0

  let moved = 0
  for (const table of TABLES) {
    const { data, error } = await supabaseAdmin.from(table).update({ user_id: user.id }).eq("user_id", LEGACY_USER_ID).select("user_id")
    if (error) {
      // user_settings is keyed by user_id: if the new user already has a row, drop the legacy one
      if (table === "user_settings") await supabaseAdmin.from(table).delete().eq("user_id", LEGACY_USER_ID)
      else console.error(`Legacy claim failed for ${table}:`, error.message)
      continue
    }
    moved += data?.length ?? 0
  }
  console.log(`Moved ${moved} legacy rows to ${user.email}`)
  return moved
}
