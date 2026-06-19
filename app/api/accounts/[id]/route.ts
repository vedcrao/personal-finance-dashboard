import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const { error } = await supabaseAdmin
    .from("accounts")
    .update({ billing_cycle_day: body.billing_cycle_day })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
