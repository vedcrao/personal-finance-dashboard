import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { TEST_USER_ID } from "@/lib/user"
import { isMissingSchema, MIGRATION_HINT } from "@/lib/db-errors"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("savings_goals")
    .select("id, name, target_amount, account_id, created_at")
    .eq("user_id", TEST_USER_ID)
    .order("created_at", { ascending: true })

  if (isMissingSchema(error)) return NextResponse.json({ goals: [], setupRequired: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    goals: (data ?? []).map((g) => ({ ...g, target_amount: Number(g.target_amount) })),
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const target = Number(body.target_amount)
  const accountId = typeof body.account_id === "string" && body.account_id ? body.account_id : null

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (!Number.isFinite(target) || target <= 0) {
    return NextResponse.json({ error: "Target must be a positive number" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("savings_goals")
    .insert({ user_id: TEST_USER_ID, name, target_amount: target, account_id: accountId })
    .select("id, name, target_amount, account_id, created_at")
    .single()

  if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ goal: { ...data, target_amount: Number(data.target_amount) } })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  const { error } = await supabaseAdmin.from("savings_goals").delete().eq("id", id).eq("user_id", TEST_USER_ID)

  if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
