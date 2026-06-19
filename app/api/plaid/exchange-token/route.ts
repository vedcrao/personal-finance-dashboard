import { NextResponse } from "next/server"
import { plaidClient } from "@/lib/plaid"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

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
        country_codes: ["US"] as any,
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
  } catch (err: any) {
    console.error("Exchange token error:", err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
