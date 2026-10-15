import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { isMissingSchema } from "@/lib/db-errors"
import { P2P_CATEGORY, ruleKeyFor } from "@/lib/categories"
import { normalizeCategory, type FlowChoice } from "@/lib/rules"
import { createRule, listRules, updateRule } from "@/lib/rules-server"
import { AUTOMATION_MIGRATION_HINT } from "@/lib/sync"

const FLOWS: FlowChoice[] = ["income", "expense", "reimbursement", "transfer"]

/**
 * PATCH { category?, flow_override?, remember?: boolean }
 * remember = also save a rule ("Apply to all similar") and apply it to every matching transaction.
 * Categories can be custom (e.g. "Gym").
 */
/**
 * PATCH { link_to: "<purchase id>" | null }
 *   Manually link a repayment (money IN, e.g. a Zelle from a friend) to the purchase it paid back,
 *   or unlink it (back into the net Venmo & Zelle line). Hand-set, so the matcher never overrides it.
 */
async function linkRepayment(userId: string, id: string, linkTo: string | null) {
  const { data: r } = await supabaseAdmin.from("transactions").select("id, amount, raw_data").eq("id", id).eq("user_id", userId).maybeSingle()
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (r.amount >= 0) return NextResponse.json({ error: "Only money coming in can be linked as a repayment" }, { status: 400 })
  const raw = { ...((r.raw_data as Record<string, unknown>) ?? {}), vertice_reimb_checked: true } as Record<string, unknown>

  if (!linkTo) {
    delete raw.vertice_reimburses
    const { error } = await supabaseAdmin.from("transactions")
      .update({ category: P2P_CATEGORY, flow_override: null, category_source: "user", raw_data: raw })
      .eq("id", id).eq("user_id", userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ transaction: { id, category: P2P_CATEGORY, flow_override: null }, reimburses: null, applied: 0 })
  }

  const { data: e } = await supabaseAdmin.from("transactions").select("id, date, amount, category, merchant_name, description")
    .eq("id", linkTo).eq("user_id", userId).maybeSingle()
  if (!e) return NextResponse.json({ error: "Purchase not found" }, { status: 404 })
  if (e.amount <= 0) return NextResponse.json({ error: "Pick a purchase (money out)" }, { status: 400 })

  const link = { id: e.id, date: e.date, merchant: (e.merchant_name ?? e.description).replace(/\s*conf(irmation)?\s*#.*$/i, "").slice(0, 60), how: "manual" }
  raw.vertice_reimburses = link
  const category = e.category ?? "Other"
  const { error } = await supabaseAdmin.from("transactions")
    .update({ category, flow_override: "reimbursement", category_source: "user", raw_data: raw })
    .eq("id", id).eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: { id, category, flow_override: "reimbursement" }, reimburses: link, applied: 0 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if ("link_to" in body) return linkRepayment(userId, id, typeof body.link_to === "string" && body.link_to ? body.link_to : null)

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

  // A hand-edited repayment is no longer tied to the purchase the matcher picked
  const { data: current } = await supabaseAdmin.from("transactions").select("raw_data").eq("id", id).eq("user_id", userId).maybeSingle()
  const raw = current?.raw_data as Record<string, unknown> | null
  let unlink: Record<string, unknown> | null = null
  if (raw && "vertice_reimburses" in raw) {
    unlink = { ...raw }
    delete unlink.vertice_reimburses
  }

  const { data: txn, error } = await supabaseAdmin
    .from("transactions")
    .update(unlink ? { ...updates, raw_data: unlink } : updates)
    .eq("id", id)
    .eq("user_id", userId)
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
    const existing = (await listRules(userId)).find((r) => r.match === match && r.min_amount == null && r.max_amount == null && !r.direction)
    const { applied } = existing?.id ? await updateRule(userId, existing.id, input) : await createRule(userId, input, "editor")
    return NextResponse.json({ transaction: txn, rule: match, applied })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save rule" }, { status: 500 })
  }
}
