import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/** Points every existing Item at PLAID_WEBHOOK_URL (new Items get it from the link token). */
export async function POST() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  const webhook = process.env.PLAID_WEBHOOK_URL
  if (!webhook?.startsWith("https://")) {
    return NextResponse.json({ error: "Set PLAID_WEBHOOK_URL to your public https URL, e.g. https://your-app.vercel.app/api/plaid/webhook" }, { status: 400 })
  }

  const { data: items, error } = await supabaseAdmin
    .from("plaid_items")
    .select("plaid_access_token, institution_name")
    .eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = await Promise.all(
    (items ?? []).map(async (i) => {
      try {
        await plaidClient.itemWebhookUpdate({ access_token: i.plaid_access_token, webhook })
        return { institution: i.institution_name, ok: true }
      } catch (e) {
        const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
        return { institution: i.institution_name, ok: false, error: code ?? "failed" }
      }
    })
  )
  return NextResponse.json({ webhook, results })
}
