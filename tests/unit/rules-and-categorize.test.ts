import { describe, expect, it } from "vitest"
import { categorize, mapPlaidCategory, type CategorizeInput, type LlmFn } from "@/lib/categorize"
import { describeRule, findRule, normalizeCategory, normalizeText, ruleMatches, type CategorizationRule } from "@/lib/rules"
import { detectRecurring } from "@/lib/finance"
import { P2P_CATEGORY } from "@/lib/categories"
import { tx, pfc } from "../helpers/factory"

const input = (p: Partial<CategorizeInput> & { description: string; amount: number }, plaid?: ReturnType<typeof pfc>): CategorizeInput => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  description: p.description,
  merchant_name: p.merchant_name ?? null,
  amount: p.amount,
  city: null,
  country: null,
  raw_data: (plaid ?? null) as CategorizeInput["raw_data"],
})
const failLLM: LlmFn = async () => { throw new Error("no llm in tests") }

describe("rule matching", () => {
  const rent: CategorizationRule = { match: "jay vanam", min_amount: 1500, direction: "out", category: "Rent", flow_override: "expense" }
  const gym: CategorizationRule = { match: "zelle payment to rohan utd", min_amount: 120, direction: "out", category: "Gym", flow_override: "expense" }

  it("matches text, amount floor and direction", () => {
    expect(ruleMatches(rent, { description: "Zelle payment to Jay Vanam Conf# 1", merchant_name: null, amount: 1615 })).toBe(true)
    expect(ruleMatches(rent, { description: "Zelle payment to Jay Vanam", merchant_name: null, amount: 102.49 })).toBe(false) // small payment ≠ rent
    expect(ruleMatches(rent, { description: "Zelle payment from Jay Vanam", merchant_name: null, amount: -1615 })).toBe(false) // money in
  })

  it("ignores ® and spacing differences", () => {
    expect(ruleMatches(gym, { description: "Zelle® Payment to Rohan Utd", merchant_name: null, amount: 125 })).toBe(true)
    expect(normalizeText("Zelle®  Payment")).toBe("zelle payment")
  })

  it("most specific rule wins (amount-bounded beats open)", () => {
    const broad: CategorizationRule = { match: "jay vanam", category: P2P_CATEGORY, flow_override: null }
    expect(findRule([broad, rent], { description: "Zelle payment to Jay Vanam", merchant_name: null, amount: 1600 })?.category).toBe("Rent")
    expect(findRule([broad, rent], { description: "Zelle payment to Jay Vanam", merchant_name: null, amount: 20 })?.category).toBe(P2P_CATEGORY)
  })

  it("custom categories are tidied; merged names map to the new category", () => {
    expect(normalizeCategory("  gym  ")).toBe("Gym")
    expect(normalizeCategory("groceries")).toBe("Shopping & Groceries")
    expect(normalizeCategory("Shopping")).toBe("Shopping & Groceries")
    expect(normalizeCategory("x".repeat(41))).toBeNull()
  })

  it("describes rules in plain English", () => {
    expect(describeRule(rent)).toContain("$1500+")
    expect(describeRule(rent)).toContain("money out")
  })
})

describe("categorization pipeline (rules → payment apps → Plaid → AI)", () => {
  it("your rule wins over everything", async () => {
    const t = input({ description: "Zelle payment to Jay Vanam", amount: 1615 }, pfc("TRANSFER_OUT", "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "LOW"))
    const { results } = await categorize([t], [{ match: "jay vanam", min_amount: 1500, direction: "out", category: "Rent", flow_override: "expense" }], failLLM)
    expect(results[0]).toMatchObject({ category: "Rent", category_source: "rule", flow_override: "expense" })
  })

  it("every payment-app transaction → Venmo & Zelle, never sent to AI", async () => {
    let called = false
    const spy: LlmFn = async () => { called = true; return [] }
    const rows = [
      input({ description: "Venmo", amount: 400 }, pfc("TRANSFER_OUT", "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "LOW")),
      input({ description: "Zelle® Payment from Amrita Kaur", amount: -22 }),
      input({ description: "Splitwise Inc DES:PAYMENT ID:3b3a", amount: -213.7 }),
    ]
    const { results, llmUsed } = await categorize(rows, [], spy)
    expect(results.every((r) => r.category === P2P_CATEGORY)).toBe(true)
    expect(llmUsed).toBe(0)
    expect(called).toBe(false)
  })

  it("Plaid's category is used when confident", async () => {
    const { results } = await categorize([input({ description: "Uber", merchant_name: "Uber", amount: 18 }, pfc("TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", "VERY_HIGH"))], [], failLLM)
    expect(results[0]).toMatchObject({ category: "Transport", category_source: "plaid" })
  })

  it("coffee by Plaid tag or by unmistakable name", async () => {
    const a = input({ description: "La Colombe", merchant_name: "La Colombe Coffee", amount: 6 }, pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK", "LOW"))
    const b = input({ description: "Peet's", merchant_name: "Peet's", amount: 5 }, pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "HIGH"))
    const { results } = await categorize([a, b], [], failLLM)
    expect(results.map((r) => r.category)).toEqual(["Coffee", "Coffee"])
  })

  it("groceries + shopping are one merged category", () => {
    expect(mapPlaidCategory(input({ description: "x", amount: 1 }, pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES")))?.category).toBe("Shopping & Groceries")
    expect(mapPlaidCategory(input({ description: "x", amount: 1 }, pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES")))?.category).toBe("Shopping & Groceries")
  })

  it("credit card payments and loan payments map to the right buckets", () => {
    expect(mapPlaidCategory(input({ description: "AMEX EPAYMENT", amount: 1153 }, pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "MEDIUM")))).toEqual({ category: "Transfer", confident: true })
    expect(mapPlaidCategory(input({ description: "NAVIENT", amount: 300 }, pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "HIGH")))?.category).toBe("Debt Payments")
  })

  it("low-confidence Plaid → AI; AI answers are validated; AI failure falls back to Plaid", async () => {
    const t = input({ id: "lc", description: "SQ *CORNER SPOT", amount: 14 }, pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "LOW"))
    const good: LlmFn = async () => [{ index: 1, category: "Food & Dining", country: "US", city: null }]
    expect((await categorize([t], [], good)).results[0]).toMatchObject({ category: "Food & Dining", category_source: "llm" })
    const invented: LlmFn = async () => [{ index: 1, category: "Snacks!!", country: null, city: null }]
    expect((await categorize([t], [], invented)).results[0]).toMatchObject({ category: "Shopping & Groceries", category_source: "plaid" })
    expect((await categorize([t], [], failLLM)).results[0]).toMatchObject({ category_source: "plaid" })
  })

  it("AI can never assign the payment-app category", async () => {
    const t = input({ description: "SQ *THING", amount: 9 }, pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "LOW"))
    const sneaky: LlmFn = async () => [{ index: 1, category: P2P_CATEGORY, country: null, city: null }]
    expect((await categorize([t], [], sneaky)).results[0].category).not.toBe(P2P_CATEGORY)
  })

  it("handles 500 transactions in one call (batches) without losing any", async () => {
    const many = Array.from({ length: 500 }, (_, i) => input({ id: `m${i}`, description: `SHOP ${i}`, amount: 5 }, pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "LOW")))
    const echo: LlmFn = async (batch) => batch.map((_, i) => ({ index: i + 1, category: "Other", country: null, city: null }))
    const { results } = await categorize(many, [], echo)
    expect(new Set(results.map((r) => r.id)).size).toBe(500)
  })
})

describe("recurring bills: same amount, regular schedule, 3+ consecutive months", () => {
  const monthly = (merchant: string, amount: number, dates: string[]) => dates.map((date) => tx({ amount, date, merchant_name: merchant, category: "Utilities" }))
  const TODAY = "2026-10-15"

  it("Comcast monthly for 7 months = recurring", () => {
    const r = detectRecurring(monthly("Comcast", 61.29, ["2026-04-11", "2026-05-11", "2026-06-11", "2026-07-11", "2026-08-11", "2026-09-11", "2026-10-11"]), "out", TODAY)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ merchant: "Comcast", frequency: "Monthly" })
  })

  it("two dinners at the same place ≠ recurring", () => {
    expect(detectRecurring(monthly("parlor pizza", 83.9, ["2026-07-19", "2026-08-19"]), "out", TODAY)).toHaveLength(0)
  })

  it("same place, varying amounts ≠ recurring (Starbucks habit)", () => {
    const rows = [4.92, 7.1, 5.6, 9.2].map((a, i) => tx({ amount: a, date: `2026-0${6 + i}-13`, merchant_name: "Starbucks" }))
    expect(detectRecurring(rows, "out", TODAY)).toHaveLength(0)
  })

  it("cancelled subscriptions drop off (last charge too long ago)", () => {
    expect(detectRecurring(monthly("Claude.ai", 20, ["2026-04-01", "2026-05-01", "2026-06-01"]), "out", TODAY)).toHaveLength(0)
  })

  it("Zelle rent with changing confirmation codes groups as one bill", () => {
    const rows = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) =>
      tx({ amount: 1615 + i * 3, date: d, description: `Zelle payment to Jay Vanam Conf# ${i}abc`, category: "Rent", flow_override: "expense" }))
    expect(detectRecurring(rows, "out", TODAY)[0]?.frequency).toBe("Monthly")
  })

  it("paycheck on the 15th + month end = twice a month (not bi-weekly)", () => {
    const dates = ["2026-07-15", "2026-07-31", "2026-08-14", "2026-08-31", "2026-09-15", "2026-09-30", "2026-10-15"]
    const rows = dates.map((d, i) => tx({ amount: -2513.88, date: d, description: `IBM 3141 DES:PAYROLL INDN:VED TRN*1*${10000 + i}`, category: "Income" }))
    const r = detectRecurring(rows, "in", TODAY)
    expect(r[0]).toMatchObject({ frequency: "Twice a month" })
    expect(Math.round(r[0].monthlyCost)).toBe(5028)
  })

  it("pending duplicates don't fake a recurrence", () => {
    const rows = [tx({ amount: 15, date: "2026-10-01", merchant_name: "Netflix", pending: true }), tx({ amount: 15, date: "2026-10-01", merchant_name: "Netflix" })]
    expect(detectRecurring(rows, "out", TODAY)).toHaveLength(0)
  })
})
