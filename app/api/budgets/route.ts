import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { listBudgets, setBudget } from "@/lib/budgets"

/** GET → { budgets: [{ category, monthly_amount }], setupRequired } */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(await listBudgets(auth.id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

/** PUT { category, monthly_amount }  (monthly_amount null or 0 removes it) */
export async function PUT(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await request.json().catch(() => ({}))
  const amount = body.monthly_amount === null || body.monthly_amount === "" ? null : Number(body.monthly_amount)
  try {
    return NextResponse.json({ budget: await setBudget(auth.id, body.category, amount) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
