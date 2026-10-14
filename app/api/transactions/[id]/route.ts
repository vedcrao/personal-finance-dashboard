import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema } from "@/lib/db-errors"
import { CATEGORIES, ruleKeyFor, type FlowOverride } from "@/lib/categorize"
import { AUTOMATION_MIGRATION_HINT } from "@/lib/sync"

const FLOWS: FlowOverride[] = ["income", "expense", "reimbursement", "transfer"]

/**
 * PATCH { category?, flow_override?: "income"|"expense"|"reimbursement"|"transfer"|null, remember?: boolean }
 * remember = also create a rule and apply it to every matching transaction (past + future).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const updates: Record<string, string | null> = { category_source: "user" }
  if ("category" in body) {
    if (body.category !== null && !(CATEGORIES as readonly string[]).includes(body.category)) {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 })
    }
    updates.category = body.category
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

  let applied = 0
  let match: string | null = null
  if (body.remember) {
    match = ruleKeyFor(txn)
    if (match.length < 4) return NextResponse.json({ error: "This transaction's description is too generic to make a rule from" }, { status: 400 })

    await supabaseAdmin
      .from("categorization_rules")
      .upsert({ user_id: TEST_USER_ID, match, category: txn.category, flow_override: txn.flow_override }, { onConflict: "user_id,match" })

    // Apply to every other matching transaction you haven't individually edited
    const escaped = match.replace(/[%_]/g, (c) => `\\${c}`)
    const ruleUpdate = { category: txn.category, flow_override: txn.flow_override, category_source: "rule" }
    const [byDesc, byMerchant] = await Promise.all([
      supabaseAdmin.from("transactions").update(ruleUpdate).eq("user_id", TEST_USER_ID).neq("id", id)
        .or("category_source.is.null,category_source.neq.user").ilike("description", `%${escaped}%`).select("id"),
      supabaseAdmin.from("transactions").update(ruleUpdate).eq("user_id", TEST_USER_ID).neq("id", id)
        .or("category_source.is.null,category_source.neq.user").ilike("merchant_name", `%${escaped}%`).select("id"),
    ])
    applied = new Set([...(byDesc.data ?? []), ...(byMerchant.data ?? [])].map((r) => r.id)).size
  }

  return NextResponse.json({ transaction: txn, rule: match, applied })
}
