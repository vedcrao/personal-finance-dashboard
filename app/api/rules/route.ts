import { NextResponse } from "next/server"
import { createRule, deleteRule, listRules, parseRuleInput, previewRule, updateRule } from "@/lib/rules-server"

const err = (e: unknown, status = 400) => NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status })

/** GET → all rules, each with how many transactions it currently matches */
export async function GET() {
  try {
    const rules = await listRules()
    const withCounts = await Promise.all(rules.map(async (r) => ({ ...r, matches: (await previewRule(r, true)).length })))
    return NextResponse.json({ rules: withCounts })
  } catch (e) {
    return err(e, 500)
  }
}

/** POST { ...rule, preview?: true } → create (and apply), or just preview matches */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  try {
    const input = parseRuleInput(body)
    if (body.preview) {
      const matches = await previewRule(input)
      return NextResponse.json({ matches: matches.length, sample: matches.slice(0, 10) })
    }
    return NextResponse.json(await createRule(input, "manual"))
  } catch (e) {
    return err(e)
  }
}

/** PATCH { id, ...rule } */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== "string") return err(new Error("id is required"))
  try {
    return NextResponse.json(await updateRule(body.id, parseRuleInput(body)))
  } catch (e) {
    return err(e)
  }
}

/** DELETE ?id= */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return err(new Error("id is required"))
  try {
    return NextResponse.json(await deleteRule(id))
  } catch (e) {
    return err(e)
  }
}
