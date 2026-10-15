import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { claimLegacyData } from "@/lib/legacy"

/** POST { identifier: email or username, password } → sets Supabase session cookies */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const identifier = String(body.identifier ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")
  if (!identifier || !password) return NextResponse.json({ error: "Enter your email or username and password" }, { status: 400 })

  let email = identifier
  if (!identifier.includes("@")) {
    const { data } = await supabaseAdmin.from("profiles").select("email").eq("username", identifier).maybeSingle()
    // Same message for unknown username and wrong password: don't reveal which usernames exist
    if (!data) {
      await new Promise((r) => setTimeout(r, 400))
      return NextResponse.json({ error: "Wrong username/email or password" }, { status: 401 })
    }
    email = data.email
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    const msg = error?.message.toLowerCase().includes("not confirmed")
      ? "Confirm your email first. Check your inbox for the link."
      : "Wrong username/email or password"
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  await claimLegacyData({ id: data.user.id, email: data.user.email ?? email })
  return NextResponse.json({ ok: true })
}
