import { describe, expect, it } from "vitest"
import { findOwnAccountTransfers, findRefundPairs, findTransferPairs } from "@/lib/transfers"
import { decideRepayments, type AskAI } from "@/lib/reimburse"
import { sumSpend, tripSummary } from "@/lib/finance"
import { P2P_CATEGORY } from "@/lib/categories"
import { tx, row, pfc } from "../helpers/factory"

const noAI: AskAI = async () => new Map()

describe("internal transfers (savings → checking, card autopay, savings → investments)", () => {
  it("pairs the two legs of a move between your own accounts", () => {
    const out = row(tx({ amount: 1615, date: "2026-10-01", account_id: "savings", description: "To Checking - 4644" }))
    const inn = row(tx({ amount: -1615, date: "2026-10-01", account_id: "checking", description: "From Savings - 6796" }))
    expect(findTransferPairs([out, inn]).map(([a, b]) => [a.id, b.id])).toEqual([[out.id, inn.id]])
  })

  it("pairs across a 1–4 day settlement lag", () => {
    const out = row(tx({ amount: 10000, date: "2026-09-09", account_id: "boa", description: "SoFi Bank DES:TRANSFER" }))
    const inn = row(tx({ amount: -10000, date: "2026-09-08", account_id: "sofi", description: "BANK OF AMERICA, N.A." }))
    expect(findTransferPairs([out, inn])).toHaveLength(1)
  })

  it("savings → brokerage: $10k out + $10k in = $0 spending once marked", () => {
    const out = row(tx({ amount: 10000, date: "2026-07-01", account_id: "savings", description: "FID BKG SVC LLC MONEYLINE" }))
    const inn = row(tx({ amount: -10000, date: "2026-07-02", account_id: "brokerage", description: "CONTRIBUTION" }))
    const [[a, b]] = findTransferPairs([out, inn])
    const marked = [out, inn].filter((t) => t.id === a.id || t.id === b.id).map((t) => ({ ...t, category: "Transfer" }))
    expect(marked).toHaveLength(2)
    expect(sumSpend(marked)).toBe(0)
  })

  it("does NOT pair payment-app transactions (two friends ≠ a transfer)", () => {
    const venmoOut = row(tx({ amount: 10, date: "2026-10-13", account_id: "boa", description: "Venmo" }))
    const zelleIn = row(tx({ amount: -10, date: "2026-10-11", account_id: "sofi", description: "Zelle payment from Amrita Kaur" }))
    expect(findTransferPairs([venmoOut, zelleIn])).toHaveLength(0)
  })

  it("does NOT pair within the same account or outside 4 days", () => {
    const a = row(tx({ amount: 50, date: "2026-10-01", account_id: "x" }))
    const b = row(tx({ amount: -50, date: "2026-10-01", account_id: "x" }))
    const c = row(tx({ amount: -50, date: "2026-10-09", account_id: "y" }))
    expect(findTransferPairs([a, b, c])).toHaveLength(0)
  })

  it("leaves your rules and hand edits alone", () => {
    const out = row(tx({ amount: 500, date: "2026-10-01", account_id: "a", category_source: "user" }))
    const inn = row(tx({ amount: -500, date: "2026-10-01", account_id: "b" }))
    expect(findTransferPairs([out, inn])).toHaveLength(0)
  })

  it("one inflow can only pair with one outflow", () => {
    const o1 = row(tx({ amount: 200, date: "2026-10-01", account_id: "a" }))
    const o2 = row(tx({ amount: 200, date: "2026-10-02", account_id: "c" }))
    const i1 = row(tx({ amount: -200, date: "2026-10-01", account_id: "b" }))
    expect(findTransferPairs([o1, o2, i1])).toHaveLength(1)
  })

  it("own-account mask in the description = transfer (e.g. a matured CD)", () => {
    const cd = row(tx({ amount: -8347.89, date: "2026-08-26", description: "BK OF AMERICA GA DES:MATUR BAL ID:XXXXXXXXXX7959 INDN" }))
    const pay = row(tx({ amount: -2500, date: "2026-08-26", description: "IBM 3141 DES:PAYROLL" }))
    expect(findOwnAccountTransfers([cd, pay], ["7959", "4644"])).toEqual([cd.id])
  })
})

describe("refund pairs", () => {
  it("purchase + same-amount refund at the same merchant/card cancel out", () => {
    const buy = row(tx({ amount: 143.62, date: "2026-10-14", account_id: "card", merchant_name: "Dick's Sporting Goods" }))
    const back = row(tx({ amount: -143.62, date: "2026-10-14", account_id: "card", merchant_name: "Dick's Sporting Goods" }))
    expect(findRefundPairs([buy, back])).toHaveLength(1)
  })

  it("two purchases + two refunds = two pairs (the Dick's case)", () => {
    const rows = [143.62, 143.62, -143.62, -143.62].map((a) => row(tx({ amount: a, date: "2026-10-14", account_id: "card", merchant_name: "Dick's" })))
    expect(findRefundPairs(rows)).toHaveLength(2)
  })

  it("refund can come up to 90 days later, never before the purchase", () => {
    const buy = row(tx({ amount: 53.48, date: "2026-07-10", account_id: "card", merchant_name: "Wellsfargo Trvl" }))
    const late = row(tx({ amount: -53.48, date: "2026-09-20", account_id: "card", merchant_name: "Wellsfargo Trvl" }))
    const early = row(tx({ amount: -53.48, date: "2026-07-01", account_id: "card", merchant_name: "Wellsfargo Trvl" }))
    expect(findRefundPairs([buy, late])).toHaveLength(1)
    expect(findRefundPairs([buy, early])).toHaveLength(0)
  })

  it("different merchant or different card doesn't pair", () => {
    const buy = row(tx({ amount: 20, date: "2026-10-01", account_id: "card", merchant_name: "Target" }))
    expect(findRefundPairs([buy, row(tx({ amount: -20, date: "2026-10-02", account_id: "card", merchant_name: "Walmart" }))])).toHaveLength(0)
    expect(findRefundPairs([buy, row(tx({ amount: -20, date: "2026-10-02", account_id: "other", merchant_name: "Target" }))])).toHaveLength(0)
  })
})

describe("repayment linking (deterministic part, AI disabled)", () => {
  const dinner = row(tx({ id: "noble", amount: 103.82, date: "2026-08-02", merchant_name: "Noble Thai", category: "Food & Dining" }))

  it("memo naming the place links it", async () => {
    const z = row(tx({ id: "z1", amount: -19.7, date: "2026-08-03", description: 'Zelle payment from JASHITH VANAM for "noble thai"; Conf# x', category: P2P_CATEGORY, category_source: "auto" }))
    const d = await decideRepayments([dinner, z], noAI)
    expect(d.get("z1")?.id).toBe("noble")
    expect(d.get("z1")?.how).toBe("memo")
  })

  it("exact split of a shared meal within 2 days links it", async () => {
    const meal = row(tx({ id: "meli", amount: 114.4, date: "2026-09-19", merchant_name: "Meli Cafe", category: "Food & Dining" }))
    const z = row(tx({ id: "z2", amount: -28.6, date: "2026-09-19", description: "Zelle payment from Rhea Rajesh", category: P2P_CATEGORY, category_source: "auto" }))
    expect((await decideRepayments([meal, z], noAI)).get("z2")?.how).toBe("split")
  })

  it("NO memo + only timing = NOT linked (the Jai Reddy / American Airlines bug)", async () => {
    const flight = row(tx({ id: "aa", amount: 208.8, date: "2026-09-14", merchant_name: "American Airlines", category: "Travel" }))
    const z = row(tx({ id: "z3", amount: -35, date: "2026-09-14", description: "Zelle® Payment from Jai Reddy", category: P2P_CATEGORY, category_source: "auto" }))
    let asked = false
    const spyAI: AskAI = async (items) => { asked = items.length > 0; return new Map() }
    const d = await decideRepayments([flight, z], spyAI)
    expect(d.get("z3")).toBeNull()
    expect(asked).toBe(false) // no memo → the AI is never consulted
  })

  it("exact split of a non-shared category (flight) is not auto-linked", async () => {
    const flight = row(tx({ id: "f", amount: 400, date: "2026-09-14", merchant_name: "United", category: "Travel" }))
    const z = row(tx({ id: "z4", amount: -200, date: "2026-09-14", description: "Zelle payment from Pat", category: P2P_CATEGORY, category_source: "auto" }))
    expect((await decideRepayments([flight, z], noAI)).get("z4")).toBeNull()
  })

  it("AI link is used only when it answers with a candidate", async () => {
    const car = row(tx({ id: "car", amount: 150.71, date: "2026-05-06", merchant_name: "Palmer Dodge", category: "Other" }))
    const z = row(tx({ id: "z5", amount: -145, date: "2026-05-06", description: 'Zelle payment from NAVEEN for "car repair"; Conf# 9', category: P2P_CATEGORY, category_source: "auto" }))
    const yesAI: AskAI = async (items) => new Map(items.map((i) => [i.r.id, i.candidates[0].id]))
    expect((await decideRepayments([car, z], yesAI)).get("z5")?.how).toBe("ai")
    const unsureAI: AskAI = async (items) => new Map(items.map((i) => [i.r.id, null]))
    expect((await decideRepayments([car, z], unsureAI)).get("z5")).toBeNull()
  })

  it("never over-links: repayments can't exceed the purchase", async () => {
    const coffee = row(tx({ id: "c", amount: 10, date: "2026-10-01", merchant_name: "Blue Bottle", category: "Coffee" }))
    const z1 = row(tx({ id: "a", amount: -5, date: "2026-10-01", description: 'Zelle payment from A for "blue bottle"', category: P2P_CATEGORY, category_source: "auto" }))
    const z2 = row(tx({ id: "b", amount: -8, date: "2026-10-01", description: 'Zelle payment from B for "blue bottle"', category: P2P_CATEGORY, category_source: "auto" }))
    const d = await decideRepayments([coffee, z1, z2], noAI)
    expect([d.get("a"), d.get("b")].filter(Boolean)).toHaveLength(1)
  })

  it("your manual links / rules are never changed", async () => {
    const z = row(tx({ id: "m", amount: -50, date: "2026-10-01", description: 'Zelle payment from X for "noble thai"', category: "Income", category_source: "user" }))
    const d = await decideRepayments([dinner, z], noAI)
    expect(d.has("m")).toBe(false)
  })

  it("rent / transfers are never 'fronted' purchases", async () => {
    const rent = row(tx({ id: "rent", amount: 1600, date: "2026-10-01", description: "Zelle payment to Jay", category: "Rent" }))
    const z = row(tx({ id: "z6", amount: -800, date: "2026-10-01", description: 'Zelle payment from roommate for "rent"', category: P2P_CATEGORY, category_source: "auto" }))
    expect((await decideRepayments([rent, z], noAI)).get("z6")).toBeNull()
  })
})

describe("TRIP: you front dinners + Airbnb, a friend fronts parking, everyone settles on Splitwise", () => {
  // Trip Jul 18–21, 4 people. You paid Airbnb $1,200 + two dinners $160 and $120.
  // Friend fronted parking $80 → your share $20 (you Venmo'd them).
  // Fair share each: (1200 + 160 + 120 + 80) / 4 = $390.
  // Others owe you: 3 × (1200 + 160 + 120)/4 = $1,110 → they settle in lumps (Splitwise + Venmo), not 1:1.
  const trip = [
    tx({ amount: 1200, date: "2026-07-18", merchant_name: "Airbnb", category: "Travel" }),
    tx({ amount: 160, date: "2026-07-19", merchant_name: "Osteria", category: "Food & Dining" }),
    tx({ amount: 120, date: "2026-07-20", merchant_name: "Taqueria", category: "Food & Dining" }),
    tx({ amount: 20, date: "2026-07-22", description: "Venmo", category: P2P_CATEGORY }), // your parking share to friend
    tx({ amount: -500, date: "2026-07-25", description: "Splitwise Inc DES:PAYMENT", category: P2P_CATEGORY }),
    tx({ amount: -370, date: "2026-07-28", description: "Venmo", category: P2P_CATEGORY }),
    tx({ amount: -240, date: "2026-08-10", description: "Zelle payment from Sam", category: P2P_CATEGORY }), // settled 3 weeks later
    // Noise that must NOT count toward the trip:
    tx({ amount: 1636, date: "2026-07-01", description: "Zelle payment to Jay Vanam", category: "Rent", flow_override: "expense" }),
    tx({ amount: 61.29, date: "2026-07-19", merchant_name: "Comcast", category: "Utilities" }),
    tx({ amount: 3000, date: "2026-07-19", account_id: "savings", description: "Transfer to brokerage", category: "Transfer" }),
    tx({ amount: -2500, date: "2026-07-15", description: "IBM PAYROLL", category: "Income" }),
  ]

  it("your true trip cost = $390 (your fair share)", () => {
    const s = tripSummary(trip, "2026-07-18", "2026-07-21")
    expect(s.paid).toBe(1480)
    expect(s.receivedBack).toBe(1110)
    expect(s.sentToOthers).toBe(20)
    expect(s.yourCost).toBe(390)
  })

  it("rent, utilities, transfers and paychecks during the trip are excluded", () => {
    const s = tripSummary(trip, "2026-07-18", "2026-07-21")
    expect(s.byCategory.map((c) => c.category).sort()).toEqual(["Food & Dining", "Travel"])
  })

  it("monthly totals: the net Venmo & Zelle line offsets what you fronted (no double counting)", () => {
    const july = trip.filter((t) => t.date.startsWith("2026-07"))
    // July spending = rent 1636 + utilities 61.29 + trip 1480 + venmo out 20 − repaid in July 870
    expect(sumSpend(july)).toBeCloseTo(1636 + 61.29 + 1480 + 20 - 870, 2)
    const aug = trip.filter((t) => t.date.startsWith("2026-08"))
    expect(sumSpend(aug)).toBe(-240) // late settle-up shows as a negative Venmo & Zelle line
  })

  it("repayments linked to trip purchases still count even if they arrive outside the window", () => {
    const late = tx({ amount: -100, date: "2026-10-01", description: "Venmo", category: "Travel", flow_override: "reimbursement", reimburses: { id: "x", date: "2026-07-18", merchant: "Airbnb" } })
    expect(tripSummary([...trip, late], "2026-07-18", "2026-07-21").receivedBack).toBe(1210)
  })
})

describe("categorizer inputs are realistic (Plaid category fixtures)", () => {
  it("fixture helper produces Plaid's shape", () => {
    expect(pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE").personal_finance_category.detailed).toBe("FOOD_AND_DRINK_COFFEE")
  })
})
