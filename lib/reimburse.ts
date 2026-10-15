import { groq } from "./groq"
import { supabaseAdmin } from "./supabase-server"
import { isP2P } from "./categories"

/**
 * Repayment matching: money IN from Zelle/Venmo/Splitwise… is, by default, part of the single net
 * "Venmo & Zelle" line. It's linked to a specific purchase you fronted ONLY when we're confident:
 *   1. memo names the merchant   Zelle "for \"noble thai\""  → the Noble Thai charge
 *   2. exact split               $80 dinner, $40 Zelle within 2 days, shared-style purchases only
 *   3. the AI says "high" confidence, ONLY when the repayment has a memo to interpret
 *      ("dinner" → a restaurant). No memo = never sent to the AI: same-day timing alone is a
 *      coincidence, not evidence (a $35 Zelle on the day of a flight isn't a flight repayment).
 * Decisions are stored in raw_data (vertice_reimb_checked / vertice_reimburses) so each repayment
 * is judged once; later runs just re-apply them.
 */

export interface Row {
  id: string
  account_id: string
  date: string
  amount: number
  description: string
  merchant_name: string | null
  category?: string | null
  category_source: string | null
  flow_override: string | null
  raw_data: Record<string, unknown> | null
}

interface Link { id: string; date: string; merchant: string; how?: "memo" | "split" | "ai" }

/** Categories people actually split with you (meals, coffee, groceries, tickets) */
const SPLITTABLE = new Set(["Food & Dining", "Coffee", "Shopping & Groceries", "Entertainment"])
/** Bump to re-judge every automatic decision after changing the rules above */
const RULES_VERSION = 2

const NOT_FRONTABLE = new Set(["Rent", "Transfer", "Debt Payments", "Income", "Venmo & Zelle", "Utilities", "Subscriptions", "Gym"])
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000
const memoOf = (t: Row) => (t.description.match(/\bfor\s+"([^"]+)"/i)?.[1] ?? "").trim()
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
const nameOf = (t: Row) => (t.merchant_name ?? t.description).replace(/\s*conf(irmation)?\s*#.*$/i, "").slice(0, 60)
const locked = (t: Row) => t.category_source === "user" || t.category_source === "rule"

function isExactSplit(purchase: number, repaid: number): boolean {
  for (let n = 2; n <= 8; n++) if (Math.abs(purchase / n - repaid) <= Math.max(0.02, (purchase / n) * 0.01)) return true
  return false
}

async function askAI(items: { r: Row; candidates: Row[] }[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!process.env.GROQ_API_KEY || !items.length) return out
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10)
    const prompt = `You link money a person received on Zelle/Venmo/Splitwise to the purchase it paid back.
Each payment has a memo written by the sender. Answer "high" ONLY when the memo clearly describes one specific candidate (e.g. memo "dinner" and exactly one restaurant charge that evening; memo "tix" and a ticket purchase). Same-day timing or a similar amount alone is NOT enough. If the memo is vague ("settle", "thanks", an emoji) or fits several candidates, answer null. Being wrong is much worse than leaving it unmatched.

${batch.map((b, k) => `#${k + 1} RECEIVED $${Math.abs(b.r.amount).toFixed(2)} on ${b.r.date} from "${nameOf(b.r)}"${memoOf(b.r) ? ` memo "${memoOf(b.r)}"` : " (no memo)"}
  candidates: ${b.candidates.map((c, j) => `[${j + 1}] ${c.date} $${c.amount.toFixed(2)} ${nameOf(c)} (${c.category})`).join("; ")}`).join("\n")}

Respond ONLY with JSON: {"items":[{"index":1,"match":2,"confidence":"high"}]}  (match = candidate number or null)`
    try {
      const res = await groq.chat.completions.create({
        model: process.env.ASSISTANT_MODEL ?? "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 1200,
      })
      const parsed = JSON.parse(res.choices[0].message.content ?? "{}") as { items?: { index: number; match: number | null; confidence?: string }[] }
      for (const it of parsed.items ?? []) {
        const b = batch[it.index - 1]
        if (!b) continue
        const c = it.confidence === "high" && it.match ? b.candidates[it.match - 1] : undefined
        out.set(b.r.id, c?.id ?? null)
      }
    } catch (e) {
      console.warn("Repayment AI check skipped:", e instanceof Error ? e.message : e)
    }
  }
  return out
}

/** Returns how many repayments were linked (new or re-applied). */
export async function matchRepayments(userId: string, rows: Row[]): Promise<number> {
  const byId = new Map(rows.map((t) => [t.id, t]))
  const expenses = rows.filter(
    (t) => t.amount > 0 && !isP2P(t) && !NOT_FRONTABLE.has(t.category ?? "") &&
      !["transfer_match", "refund_match"].includes(t.category_source ?? "") && t.flow_override !== "transfer"
  )
  const repayments = rows.filter((t) => t.amount < 0 && isP2P(t) && !locked(t))
  const paidBack = new Map<string, number>()
  const room = (e: Row) => e.amount - (paidBack.get(e.id) ?? 0)
  const decided = new Map<string, Link | null>() // repayment id → purchase (or null = keep in Venmo & Zelle)

  // Repayments you linked by hand count against their purchase too
  for (const t of rows) {
    const link = t.amount < 0 && locked(t) ? (t.raw_data?.vertice_reimburses as Link | undefined) : undefined
    if (link) paidBack.set(link.id, (paidBack.get(link.id) ?? 0) + Math.abs(t.amount))
  }

  // Earlier decisions first (so they keep their claim on a purchase)
  for (const r of repayments) {
    const raw = r.raw_data ?? {}
    if (raw.vertice_reimb_checked !== RULES_VERSION) continue
    const link = raw.vertice_reimburses as Link | undefined
    const e = link && byId.get(link.id)
    if (e && expenses.includes(e)) { decided.set(r.id, link!); paidBack.set(e.id, (paidBack.get(e.id) ?? 0) + Math.abs(r.amount)) }
    else decided.set(r.id, null)
  }

  const pending: { r: Row; candidates: Row[] }[] = []
  for (const r of repayments.filter((t) => !decided.has(t.id)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
    const amt = Math.abs(r.amount)
    const d = dayNum(r.date)
    const window = expenses
      .filter((e) => { const g = d - dayNum(e.date); return g >= -7 && g <= 45 && room(e) >= amt })
      .sort((a, b) => Math.abs(d - dayNum(a.date)) - Math.abs(d - dayNum(b.date)))
    const claim = (e: Row, how: Link["how"]) => { decided.set(r.id, { id: e.id, date: e.date, merchant: nameOf(e), how }); paidBack.set(e.id, (paidBack.get(e.id) ?? 0) + amt) }

    const memo = words(memoOf(r))
    const byMemo = memo.length ? window.find((e) => memo.some((w) => words(nameOf(e)).includes(w))) : undefined
    if (byMemo) { claim(byMemo, "memo"); continue }
    const bySplit = window.find((e) => Math.abs(d - dayNum(e.date)) <= 2 && SPLITTABLE.has(e.category ?? "") && isExactSplit(e.amount, amt))
    if (bySplit) { claim(bySplit, "split"); continue }
    // AI only gets cases with a memo to interpret; everything else stays in the net line
    if (memoOf(r) && window.length) pending.push({ r, candidates: window.slice(0, 6) })
    else decided.set(r.id, null)
  }

  const ai = await askAI(pending)
  for (const { r } of pending) {
    if (!ai.has(r.id)) continue // AI unavailable: decide next time
    const e = ai.get(r.id) ? byId.get(ai.get(r.id)!) : undefined
    if (e && room(e) >= Math.abs(r.amount)) {
      decided.set(r.id, { id: e.id, date: e.date, merchant: nameOf(e), how: "ai" })
      paidBack.set(e.id, (paidBack.get(e.id) ?? 0) + Math.abs(r.amount))
    } else decided.set(r.id, null)
  }

  let linked = 0
  const updates = [...decided.entries()]
  for (let i = 0; i < updates.length; i += 25) {
    await Promise.all(updates.slice(i, i + 25).map(async ([id, link]) => {
      const r = byId.get(id)!
      const raw = { ...(r.raw_data ?? {}), vertice_reimb_checked: RULES_VERSION } as Record<string, unknown>
      let patch: Record<string, unknown>
      if (link) {
        linked++
        raw.vertice_reimburses = link
        patch = { category: byId.get(link.id)?.category ?? r.category, flow_override: "reimbursement", category_source: "reimb_match", raw_data: raw }
      } else {
        delete raw.vertice_reimburses
        patch = r.category_source === "reimb_match"
          ? { category: "Venmo & Zelle", flow_override: null, category_source: "auto", raw_data: raw }
          : { raw_data: raw }
      }
      const unchanged = JSON.stringify(r.raw_data ?? {}) === JSON.stringify(raw) && (link ? r.category_source === "reimb_match" : r.category_source !== "reimb_match")
      if (unchanged) return
      await supabaseAdmin.from("transactions").update(patch).eq("user_id", userId).eq("id", id)
    }))
  }
  return linked
}
