import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { isOwner } from "@/lib/user"
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid"
import { supabaseAdmin } from "@/lib/supabase-server"

const CONSENTABLE: Record<string, Products> = { investments: Products.Investments, auth: Products.Auth, liabilities: Products.Liabilities }

/**
 * POST {}                                              → new connection
 * POST { item_id, consent: ["investments", "auth"] }   → update mode on an existing
 *   connection to grant extra products (no re-link, no duplicate accounts)
 * POST { item_id }                                     → update mode to fix a broken login
 */
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  const body = await request.json().catch(() => ({}))
  const webhook = process.env.PLAID_WEBHOOK_URL?.startsWith("https://") ? process.env.PLAID_WEBHOOK_URL : undefined

  const base: LinkTokenCreateRequest = {
    // Stable per user. The owner's original Items were created as "test-user", so keep that for them
    user: { client_user_id: isOwner(auth.email) ? "test-user" : userId },
    client_name: "Vertice",
    country_codes: [CountryCode.Us],
    language: "en",
    ...(webhook ? { webhook } : {}),
  }

  try {
    if (typeof body.item_id === "string") {
      const { data: item } = await supabaseAdmin
        .from("plaid_items")
        .select("plaid_access_token")
        .eq("plaid_item_id", body.item_id)
        .eq("user_id", userId)
        .single()
      if (!item) return NextResponse.json({ error: "Connection not found" }, { status: 404 })

      const consent = (Array.isArray(body.consent) ? body.consent : [])
        .map((p: string) => CONSENTABLE[p])
        .filter(Boolean) as Products[]

      const res = await plaidClient.linkTokenCreate({
        ...base,
        access_token: item.plaid_access_token,
        ...(consent.length ? { additional_consented_products: consent } : {}),
      })
      return NextResponse.json({ link_token: res.data.link_token, mode: "update" })
    }

    const res = await plaidClient.linkTokenCreate({
      ...base,
      products: [Products.Transactions],
      // Best-effort: card statements/due dates (Cards page) and holdings (Investments page)
      optional_products: [Products.Liabilities, Products.Investments],
      // Consent only — lets /api/accounts/[id]/numbers call /auth/get on demand
      additional_consented_products: [Products.Auth],
    })
    return NextResponse.json({ link_token: res.data.link_token })
  } catch (err: unknown) {
    const data = (err as { response?: { data?: unknown } })?.response?.data
    console.error("Plaid link token error:", JSON.stringify(data ?? (err instanceof Error ? err.message : err), null, 2))
    return NextResponse.json({ error: data ?? (err instanceof Error ? err.message : "Unknown error") }, { status: 500 })
  }
}
