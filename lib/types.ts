export interface Transaction {
  id: string
  account_id: string
  /** Plaid convention: positive = money out, negative = money in */
  amount: number
  merchant_name: string | null
  description: string
  date: string
  category: string | null
  is_anomaly: boolean
  city: string | null
  region: string | null
  country: string | null
  pending: boolean
  /** Your choice of how this counts; null = automatic */
  flow_override: FlowOverride | null
  /** rule | auto | plaid | llm | user | transfer_match | refund_match | reimb_match */
  category_source: string | null
  /** For repayments (Zelle/Venmo in): the purchase it paid back */
  reimburses?: { id: string; date: string; merchant: string; how?: "memo" | "split" | "ai" | "manual" } | null
}

export type FlowOverride = "income" | "expense" | "reimbursement" | "transfer"

export interface Holding {
  name: string
  symbol: string | null
  quantity: number
  price: number
  value: number
  cost_basis: number | null
  /** Plaid security type: equity, etf, mutual fund, cryptocurrency, cash, fixed income, derivative, other */
  security_type: string | null
  sector: string | null
  industry: string | null
  /** Date the institution priced this holding */
  price_as_of: string | null
}

export type AccountType = "credit" | "depository" | "investment" | "loan" | "other"

export interface Account {
  id: string
  name: string
  type: AccountType | string
  subtype: string | null
  mask: string | null
  institution_name: string
  plaid_item_id: string
  billing_cycle_day: number | null
  apy: number | null
  current_balance: number | null
  available_balance: number | null
  /** Credit limit (credit accounts) or overdraft limit (depository) */
  credit_limit: number | null
  currency: string | null
  holdings: Holding[]
}

export interface CreditLiability {
  account_id: string // our DB account id
  next_payment_due_date: string | null
  minimum_payment_amount: number | null
  last_statement_balance: number | null
  last_statement_issue_date: string | null
  last_payment_amount: number | null
  last_payment_date: string | null
  is_overdue: boolean | null
  aprs: { apr_type: string; apr_percentage: number }[]
}

export interface SavingsGoal {
  id: string
  name: string
  target_amount: number
  account_id: string | null
  created_at: string
}

export interface UserSettings {
  weekly_budget: number | null
}

export interface BalanceSnapshot {
  date: string
  type: string
  balance: number
}

export interface InvestmentActivity {
  id: string
  account_id: string
  date: string
  name: string
  /** buy | sell | cash | fee | transfer | cancel */
  type: string
  /** dividend, contribution, buy, sell, ... */
  subtype: string
  quantity: number
  price: number
  /** Plaid: positive = cash out of the account (buy), negative = cash in (sell, dividend) */
  amount: number
  fees: number | null
  ticker: string | null
  security_name: string | null
}
