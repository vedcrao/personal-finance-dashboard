import { NextResponse } from "next/server"
import { plaidClient } from "@/lib/plaid"
import { CountryCode } from "plaid"
import { supabaseAdmin } from "@/lib/supabase-server"
import { TEST_USER_ID } from "@/lib/user"

export async function POST(request: Request) {
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
      user_id: TEST_USER_ID,
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
        user_id: TEST_USER_ID,
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
