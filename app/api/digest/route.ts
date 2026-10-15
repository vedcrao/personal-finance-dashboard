import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { isOwner } from "@/lib/user"
import { supabaseAdmin } from "@/lib/supabase-server"
import { groq } from "@/lib/groq"
import twilio from "twilio"
import { flowOf, sumSpend } from "@/lib/finance"
import type { Transaction } from "@/lib/types"

export async function POST() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.id
  // Twilio sends to one configured phone number, so only the site owner can use it
  if (!isOwner(auth.email)) {
    return NextResponse.json({ error: "SMS digest is only set up for the site owner's phone number." }, { status: 403 })
  }

  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const startDate = sevenDaysAgo.toISOString().split("T")[0]

    const { data: transactions, error } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate)
      .order("date", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!transactions?.length) return NextResponse.json({ error: "No transactions found" }, { status: 400 })

    const txns = transactions.map((t) => ({ flow_override: null, ...t }) as Transaction).filter((t) => flowOf(t) !== "transfer")
    const transactionList = txns
      .map((t) => `${t.date}: ${t.merchant_name ?? t.description} - $${t.amount} (${t.category ?? "Uncategorized"}, ${flowOf(t)})`)
      .join("\n")

    const totalSpend = sumSpend(txns)

    const prompt = `Write a short, friendly weekly spending summary SMS (max 300 characters) based on these transactions:

${transactionList}

Total spend: $${totalSpend.toFixed(2)}

Be concise and conversational. Mention total spend, top category, and one insight. No emojis.`

    const result = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    })

    const message = result.choices[0].message.content?.trim() ?? "Weekly digest unavailable."

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.TWILIO_MY_PHONE!,
    })

    return NextResponse.json({ sent: true, message })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Digest error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
