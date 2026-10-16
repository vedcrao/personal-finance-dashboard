import { supabaseAdmin } from "./supabase-server"
import { isMissingSchema } from "./db-errors"
import { normalizeCategory } from "./rules"

export const BUDGETS_HINT = "Run supabase/migrations/20261018_category_budgets.sql in the Supabase SQL editor to enable category budgets."

export interface CategoryBudget { category: string; monthly_amount: number }

export async function listBudgets(userId: string): Promise<{ budgets: CategoryBudget[]; setupRequired: boolean }> {
  const { data, error } = await supabaseAdmin.from("category_budgets").select("category, monthly_amount").eq("user_id", userId).order("category")
  if (isMissingSchema(error)) return { budgets: [], setupRequired: true }
  if (error) throw new Error(error.message)
  return { budgets: (data ?? []).map((b) => ({ category: b.category, monthly_amount: Number(b.monthly_amount) })), setupRequired: false }
}

/** amount null/0 = remove the budget */
export async function setBudget(userId: string, rawCategory: unknown, amount: number | null): Promise<CategoryBudget | null> {
  const category = normalizeCategory(rawCategory)
  if (!category) throw new Error("Pick a category")
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) throw new Error("Budget must be a positive amount")

  if (!amount) {
    const { error } = await supabaseAdmin.from("category_budgets").delete().eq("user_id", userId).eq("category", category)
    if (isMissingSchema(error)) throw new Error(BUDGETS_HINT)
    if (error) throw new Error(error.message)
    return null
  }
  const { error } = await supabaseAdmin
    .from("category_budgets")
    .upsert({ user_id: userId, category, monthly_amount: Math.round(amount * 100) / 100, updated_at: new Date().toISOString() }, { onConflict: "user_id,category" })
  if (isMissingSchema(error)) throw new Error(BUDGETS_HINT)
  if (error) throw new Error(error.message)
  return { category, monthly_amount: amount }
}
