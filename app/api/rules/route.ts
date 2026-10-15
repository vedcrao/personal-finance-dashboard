import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { createRule, deleteRule, findOverlappingRules, listRules, parseRuleInput, previewRule, updateRule } from "@/lib/rules-server"

const err = (e: unknown, status = 400) => NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status })

/** GET → all rules, each with how many transactions it currently matches */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  try {
    const rules = await listRules(userId)
    const withCounts = await Promise.all(rules.map(async (r) => ({ ...r, matches: (await previewRule(userId, r, true)).length })))
    return NextResponse.json({ rules: withCounts })
  } catch (e) {
    return err(e, 500)
  }
}

/** POST { ...rule, preview?: true } → create (and apply), or just preview matches */
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const body = await request.json().catch(() => ({}))
  try {
    const input = parseRuleInput(body)
    if (body.preview) {
      const matches = await previewRule(userId, input)
      return NextResponse.json({ matches: matches.length, sample: matches.slice(0, 10) })
    }
    const overlaps = await findOverlappingRules(userId, input)
    if (overlaps.some((o) => o.kind === "duplicate")) return NextResponse.json({ error: "An identical rule already exists" }, { status: 409 })
    if (overlaps.length && !body.allow_overlap) {
      return NextResponse.json(
        { error: `Overlaps with: ${overlaps.map((o) => o.rule.name ?? o.rule.match).join(", ")}. Edit that rule instead, or save anyway.`, overlaps: overlaps.map((o) => o.rule), code: "OVERLAP" },
        { status: 409 }
      )
    }
    return NextResponse.json(await createRule(userId, input, "manual"))
  } catch (e) {
    return err(e)
  }
}

/** PATCH { id, ...rule } */
export async function PATCH(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== "string") return err(new Error("id is required"))
  try {
    return NextResponse.json(await updateRule(userId, body.id, parseRuleInput(body)))
  } catch (e) {
    return err(e)
  }
}

/** DELETE ?id= */
export async function DELETE(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return err(new Error("id is required"))
  try {
    return NextResponse.json(await deleteRule(userId, id))
  } catch (e) {
    return err(e)
  }
}
