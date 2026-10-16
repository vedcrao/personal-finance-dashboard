import { NextResponse } from "next/server"
import { getSessionUser, requireUser } from "@/lib/auth"
import { logError } from "@/lib/errors"
import { isOwner } from "@/lib/user"
import { supabaseAdmin } from "@/lib/supabase-server"

/** POST { message, stack, path } from the app (works signed out too, e.g. on the login page). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (typeof body.message !== "string" || !body.message) return NextResponse.json({ ok: false }, { status: 400 })
  const user = await getSessionUser().catch(() => null)
  await logError({
    source: "client",
    message: body.message,
    stack: typeof body.stack === "string" ? body.stack : null,
    path: typeof body.path === "string" ? body.path : null,
    userId: user?.id ?? null,
    userAgent: request.headers.get("user-agent"),
    context: typeof body.context === "object" && body.context ? body.context : undefined,
  })
  return NextResponse.json({ ok: true })
}

/** GET → latest 100 errors (owner only) */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  if (!isOwner(auth.email)) return NextResponse.json({ error: "Owner only" }, { status: 403 })
  const { data, error } = await supabaseAdmin.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100)
  if (error) return NextResponse.json({ errors: [], setupRequired: true })
  return NextResponse.json({ errors: data })
}
