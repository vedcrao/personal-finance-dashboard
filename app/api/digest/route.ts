import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { groq } from "@/lib/groq"
import twilio from "twilio"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

export async function POST() {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const startDate = sevenDaysAgo.toISOString().split("T")[0]

    const { data: transactions, error } = await supabaseAdmin
      .from("transactions")
      .select("amount, merchant_name, description, date, category")
      .eq("user_id", TEST_USER_ID)
      .gte("date", startDate)
      .order("date", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!transactions?.length) return NextResponse.json({ error: "No transactions found" }, { status: 400 })

    const transactionList = transactions
      .map((t) => `${t.date}: ${t.merchant_name ?? t.description} - $${t.amount} (${t.category ?? "Uncategorized"})`)
      .join("\n")

    const totalSpend = transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)

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
  } catch (err: any) {
    console.error("Digest error:", err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
