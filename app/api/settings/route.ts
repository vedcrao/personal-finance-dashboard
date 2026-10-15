import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors"
import type { UserSettings } from "@/lib/types"

const DEFAULTS: UserSettings = { weekly_budget: null }

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const { data, error } = await supabaseAdmin
    .from("user_settings")
    .select("weekly_budget")
    .eq("user_id", userId)
    .maybeSingle()

  if (isMissingSchema(error)) return NextResponse.json({ settings: DEFAULTS, setupRequired: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: UserSettings = {
    weekly_budget: data?.weekly_budget != null ? Number(data.weekly_budget) : null,
  }
  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const body = await request.json()
  const update: Record<string, number | null | string> = { user_id: userId, updated_at: new Date().toISOString() }

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
