import { supabaseAdmin } from "./supabase-server"
import { isMissingSchema } from "./db-errors"
import { normalizeCategory, normalizeText, ruleMatches, type CategorizationRule, type Direction, type FlowChoice } from "./rules"

export const RULES_V2_HINT = "Run supabase/migrations/20261016_rules_v2.sql in the Supabase SQL editor first."

const FLOWS: FlowChoice[] = ["income", "expense", "reimbursement", "transfer"]

export interface MatchedTxn {
  id: string
  date: string
  amount: number
  description: string
  merchant_name: string | null
  category: string | null
  category_source: string | null
}

/** Validates & normalizes rule input from the API / assistant. Throws on invalid input. */
export function parseRuleInput(body: Record<string, unknown>): Omit<CategorizationRule, "id"> {
  const match = typeof body.match === "string" ? normalizeText(body.match) : ""
  if (match.length < 3) throw new Error("`match` must be at least 3 characters of text found in the transaction description")
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))
  const min = num(body.min_amount)
  const max = num(body.max_amount)
  if (min !== null && (!Number.isFinite(min) || min < 0)) throw new Error("min_amount must be a positive number")
  if (max !== null && (!Number.isFinite(max) || max < 0)) throw new Error("max_amount must be a positive number")
  if (min !== null && max !== null && min > max) throw new Error("min_amount can't be greater than max_amount")
  const direction = body.direction === "in" || body.direction === "out" ? (body.direction as Direction) : null
  const flow = body.flow_override == null || body.flow_override === "" ? null : (body.flow_override as FlowChoice)
  if (flow !== null && !FLOWS.includes(flow)) throw new Error(`flow_override must be one of ${FLOWS.join(", ")}`)
  const category = body.category == null || body.category === "" ? null : normalizeCategory(body.category)
  if (body.category && !category) throw new Error("category must be 1–40 characters")
  if (!category && !flow) throw new Error("A rule needs a category, a flow_override, or both")
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null
  return { match, min_amount: min, max_amount: max, direction, category, flow_override: flow, name }
}

/** Transactions a rule would affect (excludes ones you edited by hand unless includeUserEdited). */
export async function previewRule(userId: string, rule: CategorizationRule, includeUserEdited = false): Promise<MatchedTxn[]> {
  // Loose DB prefilter (each word, anything between — catches "Zelle® payment"), exact check in JS.
  // Double-quoted so commas / parentheses don't break the PostgREST filter.
  const words = normalizeText(rule.match).replace(/["\\%_*]/g, "").split(" ").filter(Boolean)
  const pattern = `"%${words.join("%")}%"`
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("id, date, amount, description, merchant_name, category, category_source")
    .eq("user_id", userId)
    .or(`description.ilike.${pattern},merchant_name.ilike.${pattern}`)
    .order("date", { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as MatchedTxn[]).filter(
    (t) => ruleMatches(rule, t) && (includeUserEdited || t.category_source !== "user")
  )
}

/** Apply a rule to existing transactions right away. Returns how many changed. */
export async function applyRuleToExisting(userId: string, rule: CategorizationRule): Promise<number> {
  const matches = await previewRule(userId, rule)
  const update: Record<string, string | null> = { category_source: "rule", categorized_at: new Date().toISOString() }
  if (rule.category) update.category = rule.category
  update.flow_override = rule.flow_override
  for (let i = 0; i < matches.length; i += 100) {
    const ids = matches.slice(i, i + 100).map((m) => m.id)
    const { error } = await supabaseAdmin.from("transactions").update(update).eq("user_id", userId).in("id", ids)
    if (isMissingSchema(error)) throw new Error(RULES_V2_HINT)
    if (error) throw new Error(error.message)
  }
  return matches.length
}

export interface RuleOverlap {
  kind: "duplicate" | "overlap"
  rule: CategorizationRule
}

/**
 * Existing rules that would catch some of the same transactions as `input`:
 * match texts contain one another, directions are compatible, and amount ranges intersect.
 */
export async function findOverlappingRules(userId: string, input: Omit<CategorizationRule, "id">, ignoreId?: string): Promise<RuleOverlap[]> {
  const a = normalizeText(input.match)
  const lo = (r: { min_amount?: number | null }) => (r.min_amount == null ? 0 : Number(r.min_amount))
  const hi = (r: { max_amount?: number | null }) => (r.max_amount == null ? Infinity : Number(r.max_amount))
  return (await listRules(userId))
    .filter((r) => r.id !== ignoreId)
    .filter((r) => {
      const b = normalizeText(r.match)
      const textOverlap = a.includes(b) || b.includes(a)
      const dirOverlap = !r.direction || !input.direction || r.direction === input.direction
      const amountOverlap = Math.max(lo(r), lo(input)) <= Math.min(hi(r), hi(input))
      return textOverlap && dirOverlap && amountOverlap
    })
    .map((rule) => {
      const same =
        normalizeText(rule.match) === a && lo(rule) === lo(input) && hi(rule) === hi(input) &&
        (rule.direction ?? null) === (input.direction ?? null) && (rule.category ?? null) === (input.category ?? null) &&
        (rule.flow_override ?? null) === (input.flow_override ?? null)
      return { kind: same ? "duplicate" : "overlap", rule } as RuleOverlap
    })
}

export async function listRules(userId: string): Promise<CategorizationRule[]> {
  const { data, error } = await supabaseAdmin
    .from("categorization_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    ...r,
    min_amount: r.min_amount != null ? Number(r.min_amount) : null,
    max_amount: r.max_amount != null ? Number(r.max_amount) : null,
  })) as CategorizationRule[]
}

export async function createRule(userId: string, input: Omit<CategorizationRule, "id">, source: "editor" | "assistant" | "manual") {
  const { data, error } = await supabaseAdmin
    .from("categorization_rules")
    .insert({ ...input, user_id: userId, source })
    .select("*")
    .single()
  if (isMissingSchema(error)) throw new Error(RULES_V2_HINT)
  if (error) throw new Error(error.message)
  const applied = await applyRuleToExisting(userId, data as CategorizationRule)
  return { rule: data as CategorizationRule, applied }
}

export async function updateRule(userId: string, id: string, input: Omit<CategorizationRule, "id">) {
  const { data, error } = await supabaseAdmin
    .from("categorization_rules")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single()
  if (isMissingSchema(error)) throw new Error(RULES_V2_HINT)
  if (error || !data) throw new Error(error?.message ?? "Rule not found")
  const applied = await applyRuleToExisting(userId, data as CategorizationRule)
  return { rule: data as CategorizationRule, applied }
}

/**
 * Deletes a rule. Transactions it had set (category_source = 'rule') are cleared
 * so the next categorization pass re-decides them.
 */
export async function deleteRule(userId: string, id: string) {
  const { data: rule } = await supabaseAdmin.from("categorization_rules").select("*").eq("id", id).eq("user_id", userId).single()
  if (!rule) throw new Error("Rule not found")
  const affected = (await previewRule(userId, rule as CategorizationRule)).filter((t) => t.category_source === "rule")
  const { error } = await supabaseAdmin.from("categorization_rules").delete().eq("id", id).eq("user_id", userId)
  if (error) throw new Error(error.message)
  for (let i = 0; i < affected.length; i += 100) {
    await supabaseAdmin
      .from("transactions")
      .update({ category: null, flow_override: null, category_source: null, categorized_at: null })
      .eq("user_id", userId)
      .in("id", affected.slice(i, i + 100).map((t) => t.id))
  }
  return { reset: affected.length }
}
