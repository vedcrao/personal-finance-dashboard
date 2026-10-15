import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema } from "@/lib/db-errors"
import { ruleKeyFor } from "@/lib/categories"
import { normalizeCategory, type FlowChoice } from "@/lib/rules"
import { createRule, listRules, updateRule } from "@/lib/rules-server"
import { AUTOMATION_MIGRATION_HINT } from "@/lib/sync"

const FLOWS: FlowChoice[] = ["income", "expense", "reimbursement", "transfer"]

/**
 * PATCH { category?, flow_override?, remember?: boolean }
 * remember = also save a rule ("Apply to all similar") and apply it to every matching transaction.
 * Categories can be custom (e.g. "Gym").
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const updates: Record<string, string | null> = { category_source: "user" }
  if ("category" in body) {
    const c = body.category === null ? null : normalizeCategory(body.category)
    if (body.category !== null && !c) return NextResponse.json({ error: "Category must be 1–40 characters" }, { status: 400 })
    updates.category = c
  }
  if ("flow_override" in body) {
    if (body.flow_override !== null && !FLOWS.includes(body.flow_override)) {
      return NextResponse.json({ error: "Invalid flow_override" }, { status: 400 })
    }
    updates.flow_override = body.flow_override
  }

  const { data: txn, error } = await supabaseAdmin
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", TEST_USER_ID)
    .select("id, description, merchant_name, category, flow_override")
    .single()

  if (isMissingSchema(error)) return NextResponse.json({ error: AUTOMATION_MIGRATION_HINT }, { status: 409 })
  if (error || !txn) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 })

  if (!body.remember) return NextResponse.json({ transaction: txn, rule: null, applied: 0 })

  const match = ruleKeyFor(txn)
  if (match.length < 4) return NextResponse.json({ error: "This description is too generic to make a rule from" }, { status: 400 })

  try {
    const input = { match, category: txn.category, flow_override: txn.flow_override as FlowChoice | null, min_amount: null, max_amount: null, direction: null, name: null }
    // Reuse an existing plain (no amount conditions) rule for the same text instead of duplicating
    const existing = (await listRules()).find((r) => r.match === match && r.min_amount == null && r.max_amount == null && !r.direction)
    const { applied } = existing?.id ? await updateRule(existing.id, input) : await createRule(input, "editor")
    return NextResponse.json({ transaction: txn, rule: match, applied })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save rule" }, { status: 500 })
  }
}
