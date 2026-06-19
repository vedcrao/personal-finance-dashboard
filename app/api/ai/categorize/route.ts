import { NextResponse } from "next/server"
import { groq } from "@/lib/groq"
import { supabaseAdmin } from "@/lib/supabase-server"

const TEST_USER_ID = "0f64105d-5a67-4f2b-b8c9-dd2bdb0c4abc"

const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Shopping",
  "Entertainment",
  "Travel",
  "Transport",
  "Subscriptions",
  "Healthcare",
  "Utilities",
  "Rent",
  "Income",
  "Other",
]

interface BatchResult {
  index: number
  category: string
  country: string | null
  city: string | null
}

async function categorizeBatch(
  batch: { id: string; merchant_name: string | null; description: string; amount: number; city: string | null; country: string | null }[]
): Promise<BatchResult[]> {
  const transactionList = batch
    .map((t, i) => {
      const flow = t.amount < 0 ? "CREDIT (money IN)" : "DEBIT (money OUT)"
      return `${i + 1}. "${t.merchant_name || t.description}" $${Math.abs(t.amount)} [${flow}]`
    })
    .join("\n")

  const prompt = `For each transaction, do two things:
1. Categorize into exactly one of: ${CATEGORIES.join(", ")}
   Rules:
   - ONLY assign "Income" to transactions marked [CREDIT (money IN)]. DEBIT transactions are NEVER income.
   - Zelle/Venmo/CashApp marked DEBIT are "Other" (outgoing payments to people).
   - Zelle/Venmo/CashApp marked CREDIT are "Income" (money received).
   - ATM withdrawals are "Other". Credit card payments are "Other". ACH PMT / DES:ACH / bill pay transactions are "Other".
   - Large DEBIT payments ($500+) to a person's name (not a business) are likely "Rent".
2. Infer the country (2-letter code like "US", "FR", "GB") and city if you can tell from the merchant name. Use null if you're not sure. Most transactions are US unless the merchant name suggests otherwise (e.g. SNCF=France, Pret A Manger=UK/US, Monoprix=France).

Transactions:
${transactionList}

Reply with ONLY a JSON array, no other text:
[{"index": 1, "category": "Food & Dining", "country": "US", "city": null}, ...]`

  const result = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
  })

  const raw = result.choices[0].message.content ?? ""
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array found in response: ${raw.slice(0, 200)}`)

  return JSON.parse(match[0]) as BatchResult[]
}

// Known patterns applied before AI — overrides whatever the AI or a prior run set
const KNOWN_PATTERNS: { match: string; minAmount: number; category: string }[] = [
  { match: "jay vanam", minAmount: 500, category: "Rent" },
]

export async function POST() {
  // Apply known patterns first (fixes existing transactions regardless of current category)
  for (const pattern of KNOWN_PATTERNS) {
    await supabaseAdmin
      .from("transactions")
      .update({ category: pattern.category })
      .eq("user_id", TEST_USER_ID)
      .ilike("description", `%${pattern.match}%`)
      .gt("amount", pattern.minAmount)
  }

  const { data: transactions, error } = await supabaseAdmin
    .from("transactions")
    .select("id, description, merchant_name, amount, city, country")
    .eq("user_id", TEST_USER_ID)
    .is("category", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!transactions?.length) return NextResponse.json({ categorized: 0 })

  try {
    const BATCH_SIZE = 40
    let totalCategorized = 0

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE)
      const results = await categorizeBatch(batch)

      await Promise.all(
        results
          .filter(({ index }) => index >= 1 && index <= batch.length)
          .map(({ index, category, country, city }) => {
            const t = batch[index - 1]
            const updates: Record<string, string | null> = { category }
            // Only fill in location if Plaid didn't already provide it
            if (!t.country && country) updates.country = country
            if (!t.city && city) updates.city = city
            return supabaseAdmin.from("transactions").update(updates).eq("id", t.id)
          })
      )

      totalCategorized += results.length
    }

    return NextResponse.json({ categorized: totalCategorized })
  } catch (err: any) {
    console.error("Categorize error:", err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
