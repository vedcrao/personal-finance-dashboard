import { NextResponse } from "next/server"
import { plaidClient } from "@/lib/plaid"
import { CountryCode, Products } from "plaid"

export async function POST() {
  console.log("ENV CHECK - PLAID_CLIENT_ID:", process.env.PLAID_CLIENT_ID ? "set" : "MISSING")
  console.log("ENV CHECK - PLAID_SECRET:", process.env.PLAID_SECRET ? "set" : "MISSING")
  console.log("ENV CHECK - PLAID_ENV:", process.env.PLAID_ENV)
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "test-user" },
      client_name: "Personal Finance Dashboard",
      products: [Products.Transactions, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
    })
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err: any) {
    console.error("Plaid error full:", JSON.stringify(err?.response?.data ?? err?.message ?? err, null, 2))
    return NextResponse.json({ error: err?.response?.data ?? err?.message ?? "Unknown error" }, { status: 500 })
  }
}
