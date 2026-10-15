import { groq } from "./groq"
import { gemini } from "./gemini"

/**
 * Categorization pipeline (cheapest + most deterministic first):
 *   1. Your rules            ("Zelle payment to Jay Vanam" → Rent, counts as expense)
 *   2. Zelle detection       → "Zelle" (in = income, out = expense unless you change it)
 *   3. Plaid's own category  (personal_finance_category) when Plaid is confident
 *   4. LLM                   only for what's left (low-confidence Plaid categories)
 *   5. Plaid's category anyway if no LLM is configured / it fails
 * Transactions you've edited by hand (category_source = 'user') are never touched.
 */

import { CATEGORIES, isZelle } from "./categories"
import { findRule, type CategorizationRule } from "./rules"

export { CATEGORIES, isZelle, ruleKeyFor } from "./categories"

export type FlowOverride = "income" | "expense" | "reimbursement" | "transfer"

export interface CategorizeInput {
  id: string
  description: string
  merchant_name: string | null
  amount: number
  city: string | null
  country: string | null
  raw_data: { personal_finance_category?: { primary: string; detailed: string; confidence_level?: string | null } | null } | null
}

export type Rule = CategorizationRule

export interface CategorizeResult {
  id: string
  category: string
  category_source: "rule" | "plaid" | "llm"
  flow_override?: FlowOverride | null
  city?: string | null
  country?: string | null
}

/* ------------------------------------------------------------------ */
/* Plaid personal_finance_category → our categories                    */
/* ------------------------------------------------------------------ */

const DETAILED: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  RENT_AND_UTILITIES_RENT: "Rent",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Transfer",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
  ENTERTAINMENT_TV_AND_MOVIES: "Subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Subscriptions",
  GENERAL_SERVICES_INSURANCE: "Utilities",
}

const PRIMARY: Record<string, string> = {
  FOOD_AND_DRINK: "Food & Dining",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  MEDICAL: "Healthcare",
  PERSONAL_CARE: "Other",
  RENT_AND_UTILITIES: "Utilities",
  INCOME: "Income",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Debt Payments",
  BANK_FEES: "Other",
  GENERAL_SERVICES: "Other",
  GOVERNMENT_AND_NON_PROFIT: "Other",
}

/** Venmo / Cash App / PayPal etc. Plaid calls these transfers, but they're usually real spending or income. */
const P2P_DETAILED = new Set(["TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "TRANSFER_IN_TRANSFER_IN_FROM_APPS"])

export function mapPlaidCategory(t: CategorizeInput): { category: string; confident: boolean } | null {
  const pfc = t.raw_data?.personal_finance_category
  if (!pfc) return null
  // Never confident → the LLM reads the memo; fallback counts it as a normal expense / income
  if (P2P_DETAILED.has(pfc.detailed)) return { category: t.amount < 0 ? "Income" : "Other", confident: false }
  const category = DETAILED[pfc.detailed] ?? PRIMARY[pfc.primary] ?? "Other"
  const level = pfc.confidence_level ?? "UNKNOWN"
  // Plaid is very reliable on structural categories (transfers, payroll, card payments) even at MEDIUM
  const structural = ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "INCOME"].includes(pfc.primary)
  const confident = level === "VERY_HIGH" || level === "HIGH" || (structural && level === "MEDIUM")
  return { category, confident }
}

/* ------------------------------------------------------------------ */
/* LLM fallback                                                        */
/* ------------------------------------------------------------------ */

interface LlmItem { index: number; category: string; country: string | null; city: string | null }

function parseLlm(raw: string): LlmItem[] {
  let cleaned = raw.trim()
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "").trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    for (const k of ["items", "transactions", "results"]) if (Array.isArray(parsed?.[k])) return parsed[k]
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (m) {
      try { return JSON.parse(m[0]) } catch { /* fall through */ }
    }
  }
  throw new Error(`Failed to parse LLM response: ${raw.slice(0, 200)}`)
}

const LLM_CATEGORIES = CATEGORIES.filter((c) => c !== "Zelle")

async function llmBatch(batch: CategorizeInput[]): Promise<LlmItem[]> {
  const list = batch
    .map((t, i) => {
      const flow = t.amount < 0 ? "CREDIT (money IN)" : "DEBIT (money OUT)"
      const hint = t.raw_data?.personal_finance_category?.detailed
      return `${i + 1}. "${t.merchant_name || t.description}" $${Math.abs(t.amount)} [${flow}]${hint ? ` (bank hint: ${hint})` : ""}`
    })
    .join("\n")

  const prompt = `You are a financial transaction classification engine.
Classify each transaction into one of these categories:
${LLM_CATEGORIES.map((c) => `- "${c}"`).join("\n")}

Rules:
- Only CREDIT (money IN) transactions can be "Income" (payroll, salary, deposits). DEBIT is never "Income".
- Credit card payments, moving money between your own accounts, ATM withdrawals -> "Transfer".
- Student loan / auto loan / mortgage payments -> "Debt Payments".
- P2P payments (Venmo/CashApp/PayPal): use the memo; dining -> "Food & Dining", rides -> "Transport", rent/large to a person -> "Rent", otherwise "Other".
- Infer a 2-letter country code and city only if evident from the merchant name, else null.

Transactions:
${list}

Respond ONLY with JSON: {"items":[{"index":1,"category":"Food & Dining","country":"US","city":null}]}`

  let raw = ""
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2048,
      })
      raw = r.choices[0].message.content ?? ""
    } catch (e) {
      console.warn("Groq failed, trying Gemini:", e instanceof Error ? e.message : e)
    }
  }
  if (!raw && process.env.GOOGLE_AI_API_KEY) raw = (await gemini.generateContent(prompt)).response.text()
  if (!raw) throw new Error("No LLM provider available")
  return parseLlm(raw)
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export async function categorize(rows: CategorizeInput[], rules: Rule[]): Promise<{ results: CategorizeResult[]; llmUsed: number }> {
  const results: CategorizeResult[] = []
  const forLlm: CategorizeInput[] = []

  for (const t of rows) {
    const rule = findRule(rules, t)
    const zelle = isZelle(t)

    if (rule) {
      results.push({
        id: t.id,
        category: rule.category ?? (zelle ? "Zelle" : mapPlaidCategory(t)?.category ?? "Other"),
        category_source: "rule",
        flow_override: rule.flow_override,
      })
      continue
    }
    if (zelle) {
      results.push({ id: t.id, category: "Zelle", category_source: "rule" })
      continue
    }
    const plaid = mapPlaidCategory(t)
    if (plaid?.confident) {
      results.push({ id: t.id, category: plaid.category, category_source: "plaid" })
      continue
    }
    forLlm.push(t)
  }

  // Batches run 4 at a time — ~4x faster than one-by-one, still gentle on rate limits
  const BATCH = 20
  const batches: CategorizeInput[][] = []
  for (let i = 0; i < forLlm.length; i += BATCH) batches.push(forLlm.slice(i, i + BATCH))
  const CONCURRENCY = 4
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    await Promise.all(batches.slice(i, i + CONCURRENCY).map(async (batch) => {
      let items: LlmItem[] = []
      try {
        items = await llmBatch(batch)
      } catch (e) {
        console.warn("LLM categorization unavailable, using Plaid categories:", e instanceof Error ? e.message : e)
      }
      const byIndex = new Map(items.map((it) => [it.index, it]))
      batch.forEach((t, idx) => {
        const it = byIndex.get(idx + 1)
        if (it && (LLM_CATEGORIES as readonly string[]).includes(it.category)) {
          results.push({
            id: t.id,
            category: it.category,
            category_source: "llm",
            ...(!t.city && it.city ? { city: it.city } : {}),
            ...(!t.country && it.country ? { country: it.country } : {}),
          })
        } else {
          results.push({ id: t.id, category: mapPlaidCategory(t)?.category ?? "Other", category_source: "plaid" })
        }
      })
    }))
  }

  return { results, llmUsed: forLlm.length }
}
