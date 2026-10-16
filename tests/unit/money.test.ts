import { describe, expect, it } from "vitest"
import {
  categoryBreakdown, flowLabel, flowOf, incomeAmount, isMatchedRefund, spendAmount, spendDate, sumIncome, sumSpend,
  weekBuckets, cardNetwork, cleanAccountName, currentStatementPeriod, recurringKey,
} from "@/lib/finance"
import { P2P_CATEGORY, isP2P, ruleKeyFor } from "@/lib/categories"
import { tx, round2 } from "../helpers/factory"

describe("flowOf: how each transaction counts", () => {
  it("purchase = expense, paycheck = income", () => {
    expect(flowOf(tx({ amount: 25, date: "2026-10-01", category: "Food & Dining" }))).toBe("expense")
    expect(flowOf(tx({ amount: -2500, date: "2026-10-01", description: "IBM PAYROLL", category: "Income" }))).toBe("income")
  })

  it("Transfer category is ignored both ways", () => {
    expect(flowOf(tx({ amount: 5000, date: "2026-10-01", category: "Transfer" }))).toBe("transfer")
    expect(flowOf(tx({ amount: -5000, date: "2026-10-01", category: "Transfer" }))).toBe("transfer")
  })

  it("credit card payment text is a transfer even if uncategorized", () => {
    expect(flowOf(tx({ amount: 1200, date: "2026-10-01", description: "AMERICAN EXPRESS DES:ACH PMT" }))).toBe("transfer")
    expect(flowOf(tx({ amount: -1200, date: "2026-10-01", description: "AUTOPAY PAYMENT - THANK YOU" }))).toBe("transfer")
  })

  it("money back from a store = refund (reduces spending), not income", () => {
    const refund = tx({ amount: -40, date: "2026-10-02", merchant_name: "Target", category: "Shopping & Groceries" })
    expect(flowOf(refund)).toBe("reimbursement")
    expect(spendAmount(refund)).toBe(-40)
    expect(incomeAmount(refund)).toBe(0)
    expect(flowLabel(refund)).toBe("Refund")
  })

  it("money in that isn't from a store category (Other) = income", () => {
    expect(flowOf(tx({ amount: -50, date: "2026-10-02", category: "Other", description: "CASH BACK REDEMPTION" }))).toBe("income")
  })

  it("payment-app money IN = paid back (never income) unless a rule/edit says so", () => {
    const z = tx({ amount: -30, date: "2026-10-03", description: "Zelle payment from Sam Lee", category: P2P_CATEGORY, category_source: "auto" })
    expect(flowOf(z)).toBe("reimbursement")
    expect(flowLabel(z)).toBe("Paid back")
    const ruled = { ...z, category: "Income", category_source: "rule", flow_override: "income" as const }
    expect(flowOf(ruled)).toBe("income")
  })

  it("payment-app money OUT = expense", () => {
    expect(flowOf(tx({ amount: 30, date: "2026-10-03", description: "Venmo", category: P2P_CATEGORY }))).toBe("expense")
  })

  it("your explicit choice always wins", () => {
    expect(flowOf(tx({ amount: 400, date: "2026-10-03", description: "Venmo", category: P2P_CATEGORY, flow_override: "transfer" }))).toBe("transfer")
  })
})

describe("no double counting", () => {
  it("savings → investments: moving $10k and investing it is $0 spending", () => {
    // Both legs are Transfers once matched (see transfers.test.ts); spending ignores them
    const out = tx({ amount: 10000, date: "2026-09-09", account_id: "savings", description: "FID BKG SVC LLC MONEYLINE", category: "Transfer" })
    const inv = tx({ amount: -10000, date: "2026-09-09", account_id: "brokerage", description: "Electronic Funds Transfer Received", category: "Transfer" })
    expect(sumSpend([out, inv])).toBe(0)
    expect(sumIncome([out, inv])).toBe(0)
  })

  it("$5k moved to investments + $5k actually spent = $5k spending, not $10k", () => {
    const rows = [
      tx({ amount: 5000, date: "2026-09-10", description: "Online Transfer to Brokerage", category: "Transfer" }),
      tx({ amount: -5000, date: "2026-09-10", account_id: "brokerage", category: "Transfer" }),
      tx({ amount: 5000, date: "2026-09-12", merchant_name: "Apple Store", category: "Shopping & Groceries" }),
    ]
    expect(sumSpend(rows)).toBe(5000)
  })

  it("paying a credit card isn't spending on top of the purchases", () => {
    const rows = [
      tx({ amount: 300, date: "2026-09-01", account_id: "card", merchant_name: "Whole Foods", category: "Shopping & Groceries" }),
      tx({ amount: 300, date: "2026-09-20", account_id: "checking", description: "CHASE CREDIT CRD AUTOPAY", category: "Transfer" }),
      tx({ amount: -300, date: "2026-09-20", account_id: "card", description: "AUTOMATIC PAYMENT - THANK YOU", category: "Transfer" }),
    ]
    expect(sumSpend(rows)).toBe(300)
  })

  it("category totals always add up to total spend (one transaction, one category)", () => {
    const rows = [
      tx({ amount: 100, date: "2026-09-01", category: "Food & Dining" }),
      tx({ amount: -30, date: "2026-09-02", description: "Zelle payment from A", category: "Food & Dining", flow_override: "reimbursement", category_source: "reimb_match" }),
      tx({ amount: 50, date: "2026-09-03", description: "Venmo", category: P2P_CATEGORY }),
      tx({ amount: -80, date: "2026-09-04", description: "Venmo", category: P2P_CATEGORY }),
      tx({ amount: 20, date: "2026-09-05", category: "Transport" }),
      tx({ amount: 999, date: "2026-09-06", category: "Transfer" }),
    ]
    const total = sumSpend(rows)
    const sumCats = categoryBreakdown(rows).reduce((s, c) => s + c.amount, 0)
    expect(round2(sumCats)).toBe(round2(total))
    expect(total).toBe(100 - 30 + 50 - 80 + 20)
  })

  it("Venmo & Zelle shows as one NET line, even when negative", () => {
    const rows = [
      tx({ amount: 60, date: "2026-09-01", description: "Venmo", category: P2P_CATEGORY }),
      tx({ amount: -100, date: "2026-09-02", description: "Zelle payment from B", category: P2P_CATEGORY }),
    ]
    const line = categoryBreakdown(rows).find((c) => c.category === P2P_CATEGORY)
    expect(line?.amount).toBe(-40)
    expect(line?.pct).toBe(0) // negative share doesn't draw a negative bar
  })

  it("matched refund pairs count $0", () => {
    const buy = tx({ amount: 143.62, date: "2026-10-14", merchant_name: "Dick's", category: "Shopping & Groceries", flow_override: "transfer", category_source: "refund_match" })
    const back = tx({ amount: -143.62, date: "2026-10-14", merchant_name: "Dick's", category: "Shopping & Groceries", flow_override: "transfer", category_source: "refund_match" })
    expect(isMatchedRefund(buy)).toBe(true)
    expect(flowLabel(back)).toBe("Refunded")
    expect(sumSpend([buy, back])).toBe(0)
  })
})

describe("spendDate: repayments count in the purchase's month", () => {
  it("August Venmo for a July Airbnb reduces July", () => {
    const airbnb = tx({ id: "air", amount: 1481.42, date: "2026-07-21", merchant_name: "Airbnb", category: "Travel" })
    const venmo = tx({ amount: -974.28, date: "2026-08-24", description: "Venmo", category: "Travel", flow_override: "reimbursement", reimburses: { id: "air", date: "2026-07-21", merchant: "Airbnb" } })
    expect(spendDate(venmo)).toBe("2026-07-21")
    const july = [airbnb, venmo].filter((t) => spendDate(t).startsWith("2026-07"))
    const aug = [airbnb, venmo].filter((t) => spendDate(t).startsWith("2026-08"))
    expect(round2(sumSpend(july))).toBe(507.14)
    expect(sumSpend(aug)).toBe(0)
  })

  it("weekly chart places repayments on the purchase day", () => {
    const dinner = tx({ id: "d", amount: 90, date: "2026-10-13", category: "Food & Dining" })
    const back = tx({ amount: -30, date: "2026-10-15", description: "Zelle payment from C", category: "Food & Dining", flow_override: "reimbursement", reimburses: { id: "d", date: "2026-10-13", merchant: "X" } })
    const days = weekBuckets([dinner, back], new Date(2026, 9, 12))
    expect(days.find((d) => d.date === "2026-10-13")?.total).toBe(60)
    expect(days.find((d) => d.date === "2026-10-15")?.total).toBe(0)
  })
})

describe("text helpers", () => {
  it("detects payment apps, including ® and Splitwise", () => {
    expect(isP2P({ description: "Zelle® Payment from Jai Reddy", merchant_name: null })).toBe(true)
    expect(isP2P({ description: "Splitwise Inc DES:PAYMENT", merchant_name: null })).toBe(true)
    expect(isP2P({ description: "VENMO PAYMENT", merchant_name: "Venmo" })).toBe(true)
    expect(isP2P({ description: "Starbucks", merchant_name: "Starbucks" })).toBe(false)
  })

  it("rule keys drop confirmation codes, memos and ® symbols", () => {
    expect(ruleKeyFor({ description: 'Zelle payment to Jay Vanam for "rent"; Conf# x1f5', merchant_name: null })).toBe("zelle payment to jay vanam")
    expect(ruleKeyFor({ description: "Zelle® Payment to Rohan Utd", merchant_name: null })).toBe("zelle payment to rohan utd")
  })

  it("recurring key strips bank ACH noise so paychecks group together", () => {
    const a = recurringKey({ description: "IBM 3141 DES:PAYROLL INDN:VED RAO CO PPD PMT INFO:TRN*1*XXXXX48155\\", merchant_name: null })
    const b = recurringKey({ description: "IBM 3141", merchant_name: null })
    expect(a).toBe(b)
  })

  it("card network from product name; unknown → null (no wrong logo)", () => {
    expect(cardNetwork({ name: "Blue Cash Preferred®", institution_name: "American Express" })).toBe("amex")
    expect(cardNetwork({ name: "WELLS FARGO AUTOGRAPH VISA CARD", institution_name: "Wells Fargo" })).toBe("visa")
    expect(cardNetwork({ name: "Customized Cash Rewards Visa Signature", institution_name: "Bank of America" })).toBe("visa")
    expect(cardNetwork({ name: "Mystery Card", institution_name: "Some Credit Union" })).toBeNull()
  })

  it("cleans mojibake + trailing masks from bank account names", () => {
    expect(cleanAccountName("WELLS FARGO AUTOGRAPH VISA\uFFFD\uFFFD CARD ...7320")).toBe("WELLS FARGO AUTOGRAPH VISA CARD")
  })

  it("statement period: open period starts the day after the last close", () => {
    expect(currentStatementPeriod(12, new Date(2026, 9, 15))).toEqual({ start: "2026-10-13", end: "2026-10-15" })
    expect(currentStatementPeriod(20, new Date(2026, 9, 15))).toEqual({ start: "2026-09-21", end: "2026-10-15" })
    // Day 31 in a 30-day month clamps
    expect(currentStatementPeriod(31, new Date(2026, 10, 15)).start).toBe("2026-11-01")
  })
})
