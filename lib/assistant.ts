import type { ChatCompletionMessageParam, ChatCompletionTool } from "groq-sdk/resources/chat/completions"
import { groq } from "./groq"
import { supabaseAdmin } from "./supabase-server"
import { TEST_USER_ID } from "./user"
import { CATEGORIES } from "./categories"
import { describeRule, type CategorizationRule } from "./rules"
import { createRule, deleteRule, listRules, parseRuleInput, previewRule, updateRule } from "./rules-server"
import { flowOf, spendAmount } from "./finance"
import type { Transaction } from "./types"

/**
 * Finance assistant: natural language → rules, plus questions about your spending.
 * Runs on Groq (GROQ_API_KEY) with tool calling; the model never touches the DB directly,
 * it can only call the tools below, which validate everything.
 */

const MODEL = process.env.ASSISTANT_MODEL ?? "openai/gpt-oss-120b"

export interface AssistantAction {
  type: "rule_created" | "rule_updated" | "rule_deleted"
  summary: string
  applied?: number
}

const today = () => new Date().toISOString().slice(0, 10)

function systemPrompt(customCategories: string[]) {
  return `You are the assistant inside "Vertice", a personal finance dashboard. Today is ${today()}.
You help the user (1) set up categorization rules in plain English and (2) answer questions about their spending.

DATA MODEL
- Every transaction has: date, description (bank text, e.g. "Zelle payment to Rohan Utd Conf# x1f5"), merchant_name, amount, direction ("out" = money spent/sent, "in" = money received), category, and how it counts: income | expense | reimbursement (someone paying you back; reduces spending) | transfer (ignored, moving own money).
- Built-in categories: ${CATEGORIES.join(", ")}. Custom categories are allowed (e.g. "Gym"). Existing custom ones: ${customCategories.join(", ") || "none"}.

RULES
- A rule = { match (lowercase text that appears in the description or merchant), optional min_amount / max_amount (absolute dollars), optional direction (in|out), category and/or flow_override, short name }.
- Rules apply to past AND future transactions automatically. Transactions the user edited by hand are never changed.
- When several rules match, the most specific (amount-bounded, longer text) wins.

HOW TO WORK
1. Before creating a rule, ALWAYS call search_transactions to find the exact description text. Users say "Rohan" but the bank says "zelle payment to rohan utd". Use the shortest text that uniquely identifies the counterparty (e.g. "zelle payment to rohan utd"). If there are several different people/merchants that fit, ask which one instead of guessing.
2. Call preview_rule to see what would match. Mention the count and a couple of examples in your reply.
3. Then create_rule. For phrases like "100+" use min_amount 100. "Payment to X" means direction "out".
   For money paid to a person for rent/gym/etc., set flow_override "expense" so it counts as spending.
4. "Recurring" is a description, not a condition you can enforce. Use search results to confirm it repeats, and say so.
5. To change or remove rules, call list_rules first to get ids.
6. For spending questions use spending_summary / search_transactions. Never invent numbers.
Keep replies short and concrete: what you did, how many transactions changed, and anything ambiguous. Use plain text, no markdown tables.`
}

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Find transactions by text and filters. Returns distinct descriptions with counts, totals, dates and current categories.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Case-insensitive text to look for in description/merchant, e.g. 'rohan'" },
          min_amount: { type: "number" }, max_amount: { type: "number" },
          direction: { type: "string", enum: ["in", "out"] },
          category: { type: "string" },
          start_date: { type: "string", description: "YYYY-MM-DD" }, end_date: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_rule",
      description: "Show which existing transactions a rule would match, without saving anything.",
      parameters: {
        type: "object",
        properties: {
          match: { type: "string" }, min_amount: { type: "number" }, max_amount: { type: "number" },
          direction: { type: "string", enum: ["in", "out"] },
        },
        required: ["match"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_rule",
      description: "Save a categorization rule and apply it to all matching past transactions.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short label, e.g. 'Gym (Rohan)'" },
          match: { type: "string" }, min_amount: { type: "number" }, max_amount: { type: "number" },
          direction: { type: "string", enum: ["in", "out"] },
          category: { type: "string" },
          flow_override: { type: "string", enum: ["income", "expense", "reimbursement", "transfer"] },
        },
        required: ["match"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_rule",
      description: "Replace an existing rule's settings (all fields) and re-apply it.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" }, name: { type: "string" }, match: { type: "string" },
          min_amount: { type: "number" }, max_amount: { type: "number" },
          direction: { type: "string", enum: ["in", "out"] }, category: { type: "string" },
          flow_override: { type: "string", enum: ["income", "expense", "reimbursement", "transfer"] },
        },
        required: ["id", "match"],
      },
    },
  },
  {
    type: "function",
    function: { name: "delete_rule", description: "Delete a rule by id.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  },
  { type: "function", function: { name: "list_rules", description: "List all saved rules with ids.", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "spending_summary",
      description: "Totals of spending (expenses minus reimbursements) and income for a date range, grouped by category or merchant.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" }, end_date: { type: "string" },
          group_by: { type: "string", enum: ["category", "merchant"] },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
]

type Txn = Transaction

async function loadTransactions(): Promise<Txn[]> {
  const rows: Txn[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, account_id, amount, merchant_name, description, date, category, flow_override, category_source, pending, is_anomaly, city, region, country")
      .eq("user_id", TEST_USER_ID)
      .order("date", { ascending: false })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as Txn[]))
    if (!data || data.length < 1000) return rows
  }
}

const round = (n: number) => Math.round(n * 100) / 100
const label = (t: { merchant_name: string | null; description: string }) => (t.merchant_name ?? t.description).replace(/\bconf(irmation)?\s*#.*$/i, "").trim()

function searchTransactions(all: Txn[], a: Record<string, unknown>) {
  const q = typeof a.query === "string" ? a.query.toLowerCase() : ""
  const hits = all.filter((t) => {
    if (q && !`${t.merchant_name ?? ""} ${t.description}`.toLowerCase().includes(q)) return false
    const abs = Math.abs(t.amount)
    if (typeof a.min_amount === "number" && abs < a.min_amount) return false
    if (typeof a.max_amount === "number" && abs > a.max_amount) return false
    if (a.direction === "out" && t.amount <= 0) return false
    if (a.direction === "in" && t.amount >= 0) return false
    if (typeof a.category === "string" && (t.category ?? "").toLowerCase() !== a.category.toLowerCase()) return false
    if (typeof a.start_date === "string" && t.date < a.start_date) return false
    if (typeof a.end_date === "string" && t.date > a.end_date) return false
    return true
  })
  const groups = new Map<string, Txn[]>()
  for (const t of hits) groups.set(label(t).toLowerCase(), [...(groups.get(label(t).toLowerCase()) ?? []), t])
  return {
    total_matches: hits.length,
    groups: [...groups.entries()].slice(0, 25).map(([text, ts]) => ({
      description_text: text,
      count: ts.length,
      months_seen: new Set(ts.map((t) => t.date.slice(0, 7))).size,
      direction: ts[0].amount > 0 ? "out" : "in",
      amounts: [...new Set(ts.map((t) => round(Math.abs(t.amount))))].slice(0, 8),
      first_date: ts[ts.length - 1].date,
      last_date: ts[0].date,
      categories: [...new Set(ts.map((t) => t.category ?? "Uncategorized"))],
      counts_as: [...new Set(ts.map((t) => flowOf(t)))],
    })),
  }
}

function spendingSummary(all: Txn[], a: Record<string, unknown>) {
  const start = String(a.start_date ?? "0000-00-00")
  const end = String(a.end_date ?? "9999-99-99")
  const by = a.group_by === "merchant" ? "merchant" : "category"
  const inRange = all.filter((t) => t.date >= start && t.date <= end)
  const groups = new Map<string, number>()
  let spend = 0
  let income = 0
  for (const t of inRange) {
    const s = spendAmount(t)
    if (flowOf(t) === "income") income += Math.abs(t.amount)
    if (!s) continue
    spend += s
    const k = by === "merchant" ? label(t) : t.category ?? "Uncategorized"
    groups.set(k, (groups.get(k) ?? 0) + s)
  }
  return {
    start, end, total_spending: round(spend), total_income: round(income),
    breakdown: [...groups.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20).map(([k, v]) => ({ [by]: k, amount: round(v) })),
  }
}

export async function runAssistant(history: { role: "user" | "assistant"; content: string }[]) {
  if (!process.env.GROQ_API_KEY) throw new Error("Set GROQ_API_KEY to use the assistant")

  const all = await loadTransactions()
  const builtIn = new Set<string>(CATEGORIES)
  const custom = [...new Set(all.map((t) => t.category).filter((c): c is string => !!c && !builtIn.has(c)))]

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(custom) },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }) as ChatCompletionMessageParam),
  ]
  const actions: AssistantAction[] = []
  let txnsDirty = false

  for (let step = 0; step < 8; step++) {
    const res = await groq.chat.completions.create({ model: MODEL, messages, tools, tool_choice: "auto", temperature: 0.2, max_tokens: 1500 })
    const msg = res.choices[0].message
    if (!msg.tool_calls?.length) return { reply: msg.content?.trim() || "Done.", actions, refresh: txnsDirty }

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls })

    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function.arguments || "{}") } catch { /* empty */ }
      let result: unknown
      try {
        switch (call.function.name) {
          case "search_transactions":
            result = searchTransactions(all, args)
            break
          case "spending_summary":
            result = spendingSummary(all, args)
            break
          case "list_rules":
            result = (await listRules()).map((r) => ({ id: r.id, name: r.name, rule: describeRule(r) }))
            break
          case "preview_rule": {
            const m = await previewRule(parseRuleInput({ ...args, flow_override: "expense" }))
            result = { would_change: m.length, examples: m.slice(0, 6).map((t) => ({ date: t.date, amount: round(Math.abs(t.amount)), text: label(t), current_category: t.category })) }
            break
          }
          case "create_rule": {
            const { rule, applied } = await createRule(parseRuleInput(args), "assistant")
            actions.push({ type: "rule_created", summary: `${rule.name ? `${rule.name}: ` : ""}${describeRule(rule)}`, applied })
            txnsDirty = true
            result = { ok: true, id: rule.id, applied_to_existing: applied }
            break
          }
          case "update_rule": {
            const { rule, applied } = await updateRule(String(args.id), parseRuleInput(args))
            actions.push({ type: "rule_updated", summary: describeRule(rule), applied })
            txnsDirty = true
            result = { ok: true, applied_to_existing: applied }
            break
          }
          case "delete_rule": {
            const r = await deleteRule(String(args.id))
            actions.push({ type: "rule_deleted", summary: `Deleted rule (${r.reset} transactions will be re-categorized)` })
            txnsDirty = true
            result = { ok: true, ...r }
            break
          }
          default:
            result = { error: `Unknown tool ${call.function.name}` }
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) })
    }
  }
  return { reply: "I ran out of steps. Try a more specific request.", actions, refresh: txnsDirty }
}

export type { CategorizationRule }
