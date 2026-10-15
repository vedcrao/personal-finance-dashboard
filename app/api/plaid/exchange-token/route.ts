import { NextResponse } from "next/server"
import { requirePlaid, requireUser } from "@/lib/auth"
import { CountryCode } from "plaid"
import { supabaseAdmin } from "@/lib/supabase-server"

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  const plaidClient = await requirePlaid(userId)
  if (plaidClient instanceof NextResponse) return plaidClient

  try {
    const { public_token } = await request.json()

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token })
    const accessToken = exchangeResponse.data.access_token
    const itemId = exchangeResponse.data.item_id

    // Get institution name for display
    const itemResponse = await plaidClient.itemGet({ access_token: accessToken })
    const institutionId = itemResponse.data.item.institution_id
    let institutionName = "Unknown Bank"
    if (institutionId) {
      const instResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      })
      institutionName = instResponse.data.institution.name
    }

    // Save to plaid_items (supports multiple banks)
    const { error: itemError } = await supabaseAdmin.from("plaid_items").upsert({
      user_id: userId,
      plaid_access_token: accessToken,
      plaid_item_id: itemId,
      institution_name: institutionName,
    }, { onConflict: "plaid_item_id" })

    if (itemError) {
      console.error("plaid_items upsert error:", itemError.message)
      return NextResponse.json({ error: itemError.message }, { status: 500 })
    }

    // Save linked accounts
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken })
    const accounts = accountsResponse.data.accounts

    const { error: accountsError } = await supabaseAdmin.from("accounts").upsert(
      accounts.map((account) => ({
        user_id: userId,
        plaid_account_id: account.account_id,
        plaid_item_id: itemId,
        name: account.name,
        type: account.type,
        subtype: account.subtype ?? null,
        mask: account.mask ?? null,
      })),
      { onConflict: "plaid_account_id" }
    )

    if (accountsError) {
      console.error("Accounts upsert error:", accountsError.message)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, institution: institutionName })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Exchange token error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
