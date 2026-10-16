import { NextResponse } from "next/server"
import { requireUser, supabaseServer } from "@/lib/auth"

/** POST { password } → set a new password for the signed-in user (after the reset link) */
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await request.json().catch(() => ({}))
  const password = String(body.password ?? "")
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
