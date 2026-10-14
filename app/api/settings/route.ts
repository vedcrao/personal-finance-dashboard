import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors"
import type { UserSettings } from "@/lib/types"

const DEFAULTS: UserSettings = { weekly_budget: null }

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("user_settings")
    .select("weekly_budget")
    .eq("user_id", TEST_USER_ID)
    .maybeSingle()

  if (isMissingSchema(error)) return NextResponse.json({ settings: DEFAULTS, setupRequired: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: UserSettings = {
    weekly_budget: data?.weekly_budget != null ? Number(data.weekly_budget) : null,
  }
  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const update: Record<string, number | null | string> = { user_id: TEST_USER_ID, updated_at: new Date().toISOString() }

  if ("weekly_budget" in body) {
    const v = body.weekly_budget === null || body.weekly_budget === "" ? null : Number(body.weekly_budget)
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      return NextResponse.json({ error: "weekly_budget must be a positive number" }, { status: 400 })
    }
    update.weekly_budget = v
  }

  const { error } = await supabaseAdmin.from("user_settings").upsert(update, { onConflict: "user_id" })

  if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
