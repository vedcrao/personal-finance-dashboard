import { NextResponse } from "next/server"
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/session"

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD
  if (!password) return NextResponse.json({ ok: true })

  const body = await request.json().catch(() => ({}))
  const given = typeof body.password === "string" ? body.password : ""
  if (!safeEqual(sessionToken(given), sessionToken(password))) {
    await new Promise((r) => setTimeout(r, 600)) // slow down guessing
    return NextResponse.json({ error: "Wrong password" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
