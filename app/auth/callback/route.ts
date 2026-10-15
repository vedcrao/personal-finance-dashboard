import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/auth"
import { claimLegacyData } from "@/lib/legacy"

/** Email confirmation link lands here: exchange the code for a session, then continue. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const nextParam = url.searchParams.get("next") ?? "/"
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/"

  if (code) {
    const supabase = await supabaseServer()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await claimLegacyData({ id: data.user.id, email: data.user.email ?? "" })
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin))
}
