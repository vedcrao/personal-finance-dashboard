import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/** POST { identifier: email or username } → sends a reset link. Always "ok" (don't reveal who has accounts). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const id = String(body.identifier ?? "").trim().toLowerCase()
  if (!id) return NextResponse.json({ error: "Enter your email or username" }, { status: 400 })
  let email = id
  if (!id.includes("@")) {
    const { data } = await supabaseAdmin.from("profiles").select("email").eq("username", id).maybeSingle()
    if (!data) return NextResponse.json({ ok: true })
    email = data.email
  }
  const origin = new URL(request.url).origin
  const supabase = await supabaseServer()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` })
  if (error) console.warn("Reset email failed:", error.message)
  return NextResponse.json({ ok: true })
}
