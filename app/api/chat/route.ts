import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { applyCategorization } from "@/lib/sync"
import { runAssistant } from "@/lib/assistant"

export const maxDuration = 60

/** POST { messages: [{ role: "user" | "assistant", content }] } → { reply, actions, refresh } */
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const body = await request.json().catch(() => ({}))
  const messages = Array.isArray(body.messages)
    ? body.messages.filter(
        (m: unknown): m is { role: "user" | "assistant"; content: string } =>
          !!m && typeof m === "object" && ["user", "assistant"].includes((m as { role: string }).role) && typeof (m as { content: unknown }).content === "string"
      )
    : []
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one user message" }, { status: 400 })
  }

  try {
    const result = await runAssistant(userId, messages)
    // Deleted rules leave transactions uncategorized; re-decide them right away (time-boxed)
    if (result.actions.some((a) => a.type === "rule_deleted")) await applyCategorization(userId, "uncategorized", { budgetMs: 15_000 })
    return NextResponse.json(result)
  } catch (e) {
    console.error("Assistant error:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Assistant failed" }, { status: 500 })
  }
}
