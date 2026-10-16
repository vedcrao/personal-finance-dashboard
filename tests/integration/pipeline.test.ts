import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { __setPlaidClientForTests } from "@/lib/plaid"
import { syncAndCategorize, applyCategorization } from "@/lib/sync"
import { createRule, deleteRule, findOverlappingRules, listRules, parseRuleInput } from "@/lib/rules-server"
import { deleteUserCompletely } from "@/lib/account"
import { listBudgets, setBudget } from "@/lib/budgets"
import { sumSpend, type Flow } from "@/lib/finance"
import { P2P_CATEGORY } from "@/lib/categories"
import type { Transaction } from "@/lib/types"
import { fakePlaid, type FakeTxn } from "../helpers/fakePlaid"
import { admin, createTestUser, transactionsOf, type TestUser } from "../helpers/testUser"

/**
 * Real Supabase + real sync/categorization/matching code, fake Plaid, no AI (GROQ disabled).
 * Everything happens under a throwaway user that's deleted at the end.
 */
let u: TestUser
let plaid: ReturnType<typeof fakePlaid>
const groqKey = process.env.GROQ_API_KEY
const P = (cat: string, det: string, conf = "VERY_HIGH") => ({ primary: cat, detailed: det, confidence_level: conf })

beforeAll(async () => {
  delete process.env.GROQ_API_KEY // deterministic: no LLM in this suite
  delete process.env.GOOGLE_AI_API_KEY
  u = await createTestUser("pipeline")
  plaid = fakePlaid([
    { account_id: u.plaidAccountIds.checking, name: "Test checking", type: "depository", subtype: "checking", mask: "1111" },
    { account_id: u.plaidAccountIds.savings, name: "Test savings", type: "depository", subtype: "savings", mask: "2222" },
    { account_id: u.plaidAccountIds.card, name: "Test card", type: "credit", subtype: "credit card", mask: "3333" },
    { account_id: u.plaidAccountIds.brokerage, name: "Test brokerage", type: "investment", subtype: "brokerage", mask: "4444" },
  ])
  __setPlaidClientForTests(() => plaid.client)
})

afterAll(async () => {
  __setPlaidClientForTests(null)
  if (groqKey) process.env.GROQ_API_KEY = groqKey
  await u?.cleanup()
})

const id = (s: string) => `${s}-${u.id.slice(0, 8)}`
const t = (p: Omit<FakeTxn, "transaction_id"> & { key: string }): FakeTxn => ({ transaction_id: id(p.key), ...p })
const asTx = (rows: Awaited<ReturnType<typeof transactionsOf>>) => rows as unknown as Transaction[]

describe("sync ETL (Plaid /transactions/sync → Supabase)", () => {
  it("first sync: pages through has_more and stores everything with the right accounts", async () => {
    plaid.push({
      added: [
        t({ key: "coffee", account_id: u.plaidAccountIds.card, amount: 5.5, date: "2026-09-02", name: "Peet's", merchant_name: "Peet's", personal_finance_category: P("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE") }),
        t({ key: "uber", account_id: u.plaidAccountIds.card, amount: 18, date: "2026-09-03", name: "Uber", merchant_name: "Uber", personal_finance_category: P("TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES") }),
        t({ key: "pay", account_id: u.plaidAccountIds.checking, amount: -2500, date: "2026-09-15", name: "ACME PAYROLL", personal_finance_category: P("INCOME", "INCOME_WAGES") }),
        t({ key: "toinv", account_id: u.plaidAccountIds.savings, amount: 5000, date: "2026-09-10", name: "Online Transfer to Brokerage", personal_finance_category: P("TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS") }),
        t({ key: "ininv", account_id: u.plaidAccountIds.brokerage, amount: -5000, date: "2026-09-11", name: "Contribution", personal_finance_category: P("TRANSFER_IN", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS") }),
        t({ key: "laptop", account_id: u.plaidAccountIds.card, amount: 1200, date: "2026-09-12", name: "Apple Store", merchant_name: "Apple", personal_finance_category: P("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS") }),
        t({ key: "cardpay", account_id: u.plaidAccountIds.checking, amount: 1223.5, date: "2026-09-25", name: "CARD AUTOPAY", personal_finance_category: P("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") }),
        t({ key: "cardrcv", account_id: u.plaidAccountIds.card, amount: -1223.5, date: "2026-09-25", name: "PAYMENT - THANK YOU", personal_finance_category: P("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") }),
        t({ key: "venmoout", account_id: u.plaidAccountIds.checking, amount: 40, date: "2026-09-20", name: "Venmo", personal_finance_category: P("TRANSFER_OUT", "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", "LOW") }),
      ],
    })
    const r = await syncAndCategorize(u.id)
    expect(r.items[0].error).toBeUndefined()
    expect(r.synced).toBe(9)
    expect(plaid.calls.length).toBeGreaterThan(2) // paginated
    const rows = await transactionsOf(u.id)
    expect(rows).toHaveLength(9)
    expect(rows.every((x) => x.category)).toBe(true) // nothing left uncategorized
    const { data: item } = await admin().from("plaid_items").select("transactions_cursor, status, last_synced_at").eq("plaid_item_id", u.itemId).single()
    expect(item?.transactions_cursor).toBeTruthy()
    expect(item?.status).toBe("ok")
  })

  it("categorizes correctly: Plaid categories, coffee, payment app, transfers", async () => {
    const rows = await transactionsOf(u.id)
    const by = (k: string) => rows.find((x) => x.plaid_transaction_id === id(k))!
    expect(by("coffee").category).toBe("Coffee")
    expect(by("uber").category).toBe("Transport")
    expect(by("pay").category).toBe("Income")
    expect(by("laptop").category).toBe("Shopping & Groceries")
    expect(by("venmoout").category).toBe(P2P_CATEGORY)
    for (const k of ["toinv", "ininv", "cardpay", "cardrcv"]) expect(by(k).category).toBe("Transfer")
  })

  it("NO DOUBLE COUNTING: $5k savings→brokerage + card payoff = $0; real spending only", async () => {
    const rows = asTx(await transactionsOf(u.id))
    // 5.5 coffee + 18 uber + 1200 laptop + 40 venmo = 1263.5 (not +5000 investing, not +1223.5 card payment)
    expect(sumSpend(rows)).toBeCloseTo(1263.5, 2)
  })

  it("incremental sync: modified + removed + pending→posted", async () => {
    plaid.push({
      added: [t({ key: "pend", account_id: u.plaidAccountIds.card, amount: 30, date: "2026-10-01", name: "Chipotle", merchant_name: "Chipotle", pending: true, personal_finance_category: P("FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD") })],
      modified: [t({ key: "uber", account_id: u.plaidAccountIds.card, amount: 21, date: "2026-09-03", name: "Uber", merchant_name: "Uber", personal_finance_category: P("TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES") })],
      removed: [{ transaction_id: id("coffee") }],
    })
    const r = await syncAndCategorize(u.id)
    expect(r.removed).toBe(1)
    let rows = await transactionsOf(u.id)
    expect(rows.find((x) => x.plaid_transaction_id === id("coffee"))).toBeUndefined()
    expect(Number(rows.find((x) => x.plaid_transaction_id === id("uber"))!.amount)).toBe(21)
    expect(rows.find((x) => x.plaid_transaction_id === id("pend"))!.pending).toBe(true)

    // Plaid posts it: pending one removed, posted one added
    plaid.push({
      removed: [{ transaction_id: id("pend") }],
      added: [t({ key: "posted", account_id: u.plaidAccountIds.card, amount: 31.2, date: "2026-10-02", name: "Chipotle", merchant_name: "Chipotle", personal_finance_category: P("FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD") })],
    })
    await syncAndCategorize(u.id)
    rows = await transactionsOf(u.id)
    expect(rows.filter((x) => String(x.description).includes("Chipotle"))).toHaveLength(1)
  })

  it("re-syncing the same data is idempotent (no duplicates)", async () => {
    const before = (await transactionsOf(u.id)).length
    plaid.push({ modified: [t({ key: "laptop", account_id: u.plaidAccountIds.card, amount: 1200, date: "2026-09-12", name: "Apple Store", merchant_name: "Apple" })] })
    await syncAndCategorize(u.id)
    expect((await transactionsOf(u.id)).length).toBe(before)
  })

  it("Plaid login errors mark the bank as needing reconnect (and don't crash)", async () => {
    const broken = { ...plaid.client, transactionsSync: async () => { throw Object.assign(new Error("x"), { response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } }) } }
    __setPlaidClientForTests(() => broken as unknown as typeof plaid.client)
    const r = await syncAndCategorize(u.id)
    expect(r.items[0].error).toBe("ITEM_LOGIN_REQUIRED")
    const { data } = await admin().from("plaid_items").select("status").eq("plaid_item_id", u.itemId).single()
    expect(data?.status).toBe("login_required")
    __setPlaidClientForTests(() => plaid.client)
    await syncAndCategorize(u.id)
    const { data: ok } = await admin().from("plaid_items").select("status").eq("plaid_item_id", u.itemId).single()
    expect(ok?.status).toBe("ok")
  })
})

describe("rules (database)", () => {
  it("a new rule applies to past transactions immediately AND to future syncs", async () => {
    const { applied } = await createRule(u.id, parseRuleInput({ match: "chipotle", category: "Food & Dining", flow_override: "expense", name: "Chipotle" }), "manual")
    expect(applied).toBe(1)
    plaid.push({ added: [t({ key: "chip2", account_id: u.plaidAccountIds.card, amount: 12, date: "2026-10-05", name: "CHIPOTLE 1234", personal_finance_category: P("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "LOW") })] })
    await syncAndCategorize(u.id)
    const row = (await transactionsOf(u.id)).find((x) => x.plaid_transaction_id === id("chip2"))!
    expect(row).toMatchObject({ category: "Food & Dining", category_source: "rule" })
  })

  it("amount-bounded rule: only big payments count as rent", async () => {
    plaid.push({ added: [
      t({ key: "rentbig", account_id: u.plaidAccountIds.checking, amount: 1600, date: "2026-10-01", name: "Zelle payment to Pat Landlord Conf# a1" }),
      t({ key: "rentsmall", account_id: u.plaidAccountIds.checking, amount: 25, date: "2026-10-03", name: "Zelle payment to Pat Landlord Conf# b2" }),
    ] })
    await syncAndCategorize(u.id)
    await createRule(u.id, parseRuleInput({ match: "zelle payment to pat landlord", min_amount: 1000, direction: "out", category: "Rent", flow_override: "expense" }), "manual")
    const rows = await transactionsOf(u.id)
    expect(rows.find((x) => x.plaid_transaction_id === id("rentbig"))!.category).toBe("Rent")
    expect(rows.find((x) => x.plaid_transaction_id === id("rentsmall"))!.category).toBe(P2P_CATEGORY)
  })

  it("duplicate / overlapping rules are detected", async () => {
    const same = parseRuleInput({ match: "zelle payment to pat landlord", min_amount: 1000, direction: "out", category: "Rent", flow_override: "expense" })
    expect((await findOverlappingRules(u.id, same)).map((o) => o.kind)).toContain("duplicate")
    const overlap = parseRuleInput({ match: "pat landlord", min_amount: 1500, direction: "out", category: "Rent", flow_override: "expense" })
    expect((await findOverlappingRules(u.id, overlap)).map((o) => o.kind)).toContain("overlap")
    const unrelated = parseRuleInput({ match: "starbucks", category: "Coffee" })
    expect(await findOverlappingRules(u.id, unrelated)).toHaveLength(0)
  })

  it("hand edits survive 'Re-categorize everything'", async () => {
    const row = (await transactionsOf(u.id)).find((x) => x.plaid_transaction_id === id("laptop"))!
    await admin().from("transactions").update({ category: "Gifts", category_source: "user" }).eq("id", row.id)
    let since: string | undefined
    for (let i = 0; i < 10; i++) { const r = await applyCategorization(u.id, "all", { since }); since = r.since; if (!r.remaining) break }
    expect((await transactionsOf(u.id)).find((x) => x.id === row.id)!.category).toBe("Gifts")
  })

  it("deleting a rule re-categorizes what it had set", async () => {
    const rule = (await listRules(u.id)).find((r) => r.name === "Chipotle")!
    await deleteRule(u.id, rule.id!)
    await applyCategorization(u.id, "uncategorized")
    const rows = await transactionsOf(u.id)
    expect(rows.filter((x) => String(x.description).toLowerCase().includes("chipotle")).every((x) => x.category_source !== "rule")).toBe(true)
  })

  it("rejects bad rule input", () => {
    expect(() => parseRuleInput({ match: "ab", category: "X" })).toThrow()
    expect(() => parseRuleInput({ match: "valid text", min_amount: 50, max_amount: 10, category: "X" })).toThrow()
    expect(() => parseRuleInput({ match: "valid text" })).toThrow() // needs category or flow
  })
})

describe("refunds + repayments (database, no AI)", () => {
  it("purchase + refund on the same card → both 'refunded', $0", async () => {
    plaid.push({ added: [
      t({ key: "shoes", account_id: u.plaidAccountIds.card, amount: 89.99, date: "2026-10-06", name: "Nike", merchant_name: "Nike", personal_finance_category: P("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES") }),
      t({ key: "shoesback", account_id: u.plaidAccountIds.card, amount: -89.99, date: "2026-10-09", name: "Nike", merchant_name: "Nike", personal_finance_category: P("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES") }),
    ] })
    await syncAndCategorize(u.id)
    const rows = await transactionsOf(u.id)
    for (const k of ["shoes", "shoesback"]) expect(rows.find((x) => x.plaid_transaction_id === id(k))!.category_source).toBe("refund_match")
    expect(sumSpend(asTx(rows.filter((x) => String(x.description) === "Nike")))).toBe(0)
  })

  it("Zelle with a memo naming the dinner links to it; vague one stays in the net line", async () => {
    plaid.push({ added: [
      t({ key: "dinner", account_id: u.plaidAccountIds.card, amount: 120, date: "2026-10-07", name: "Osteria Mozza", merchant_name: "Osteria Mozza", personal_finance_category: P("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT") }),
      t({ key: "zmemo", account_id: u.plaidAccountIds.checking, amount: -40, date: "2026-10-08", name: 'Zelle payment from Sam for "osteria"; Conf# z1' }),
      // $33 isn't a clean share of $120 and has no memo → must stay in the net line
      t({ key: "zvague", account_id: u.plaidAccountIds.checking, amount: -33, date: "2026-10-08", name: "Zelle payment from Alex Conf# z2" }),
    ] })
    await syncAndCategorize(u.id)
    const rows = await transactionsOf(u.id)
    const memo = rows.find((x) => x.plaid_transaction_id === id("zmemo"))!
    const vague = rows.find((x) => x.plaid_transaction_id === id("zvague"))!
    expect(memo).toMatchObject({ category: "Food & Dining", category_source: "reimb_match" })
    expect(vague.category).toBe(P2P_CATEGORY)
    // Either way each dollar counts exactly once: dinner 120 − 40 (food) − 33 (net line)
    const oct7to8 = asTx(rows.filter((x) => ["dinner", "zmemo", "zvague"].map(id).includes(x.plaid_transaction_id)))
    expect(sumSpend(oct7to8)).toBe(47)
  })

  it("an exact even split of a shared meal (no memo) IS linked", async () => {
    plaid.push({ added: [
      t({ key: "pizza", account_id: u.plaidAccountIds.card, amount: 90, date: "2026-10-10", name: "Joe's Pizza", merchant_name: "Joe's Pizza", personal_finance_category: P("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT") }),
      t({ key: "zsplit", account_id: u.plaidAccountIds.checking, amount: -30, date: "2026-10-10", name: "Zelle payment from Jordan Conf# z3" }),
    ] })
    await syncAndCategorize(u.id)
    const z = (await transactionsOf(u.id)).find((x) => x.plaid_transaction_id === id("zsplit"))!
    expect(z).toMatchObject({ category: "Food & Dining", category_source: "reimb_match" })
  })
})

describe("budgets + account deletion", () => {
  it("set / update / remove a category budget", async () => {
    const before = await listBudgets(u.id)
    if (before.setupRequired) return console.warn("category_budgets migration not run: skipping budget assertions")
    await setBudget(u.id, "Food & Dining", 400)
    await setBudget(u.id, "food & dining", 450) // same category, different case → update
    let b = (await listBudgets(u.id)).budgets
    expect(b).toEqual([{ category: "Food & Dining", monthly_amount: 450 }])
    await setBudget(u.id, "Food & Dining", null)
    b = (await listBudgets(u.id)).budgets
    expect(b).toHaveLength(0)
    await expect(setBudget(u.id, "Food & Dining", -5)).rejects.toThrow()
  })

  it("deleting an account removes every row and the login", async () => {
    const victim = await createTestUser("delete")
    await admin().from("transactions").insert({ user_id: victim.id, account_id: victim.accounts.checking, plaid_transaction_id: `del-${victim.id}`, amount: 5, description: "x", date: "2026-10-01" })
    await admin().from("categorization_rules").insert({ user_id: victim.id, match: "something", category: "Other" })
    __setPlaidClientForTests(() => plaid.client)
    const report = await deleteUserCompletely(victim.id)
    expect(report.banksDisconnected).toBe(1)
    for (const table of ["transactions", "accounts", "plaid_items", "categorization_rules"]) {
      const { count } = await admin().from(table).select("*", { count: "exact", head: true }).eq("user_id", victim.id)
      expect(count, table).toBe(0)
    }
    expect((await admin().auth.admin.getUserById(victim.id)).data.user).toBeNull()
  })

  it("another user's data is invisible (scoping)", async () => {
    const other = await createTestUser("other")
    try {
      expect((await transactionsOf(other.id))).toHaveLength(0)
      expect((await listRules(other.id))).toHaveLength(0)
      // And the main test user's rows all carry their own id
      const mine = await transactionsOf(u.id)
      expect(mine.every((x) => x.user_id === u.id)).toBe(true)
    } finally {
      await other.cleanup()
    }
  })
})

export type { Flow }
