import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id

  const { id } = await params
  const body = await request.json()

  const updates: Record<string, number | null> = {}

  if ("billing_cycle_day" in body) {
    const day = body.billing_cycle_day === null ? null : Number(body.billing_cycle_day)
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      return NextResponse.json({ error: "billing_cycle_day must be 1–31" }, { status: 400 })
    }
    updates.billing_cycle_day = day
  }

  if ("apy" in body) {
    const apy = body.apy === null || body.apy === "" ? null : Number(body.apy)
    if (apy !== null && (!Number.isFinite(apy) || apy < 0 || apy > 100)) {
      return NextResponse.json({ error: "apy must be between 0 and 100" }, { status: 400 })
    }
    updates.apy = apy
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    const msg = isMissingSchema(error) ? MIGRATION_HINT : error.message
    return NextResponse.json({ error: msg }, { status: isMissingSchema(error) ? 409 : 500 })
  }
  return NextResponse.json({ success: true })
}
