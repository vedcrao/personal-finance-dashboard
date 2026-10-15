import { createClient } from "@supabase/supabase-js"
import { flowOf, spendAmount } from "./lib/finance"
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: me } = await sb.from("profiles").select("id").eq("username", "vedcrao").single()
const r: any[] = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from("transactions").select("*").eq("user_id", me!.id).order("date").range(f, f + 999); r.push(...data!); if (data!.length < 1000) break }
const { data: accts } = await sb.from("accounts").select("id,name"); const an = new Map(accts!.map(a => [a.id, a.name.slice(0, 14)]))
console.log("history:", r[0].date, "→", r[r.length - 1].date, "| per account first date:", [...new Set(r.map(t => t.account_id))].map(a => `${an.get(a)} ${r.find(t => t.account_id === a).date}`).join(", "))
console.log("\nJAY:"); for (const t of r.filter(t => /jay vanam/i.test(t.description))) console.log(" ", t.date, String(t.amount).padStart(8), t.category, t.category_source, t.flow_override)
const { data: rules } = await sb.from("categorization_rules").select("*").eq("user_id", me!.id); console.log("\nRULES:", rules!.map(x => `[${x.name ?? "-"}] "${x.match}" min=${x.min_amount} dir=${x.direction} → ${x.category}/${x.flow_override} (${x.source})`))
console.log("\nJULY big spend + P2P in:")
for (const t of r.filter(t => t.date.startsWith("2026-07") && ((t.amount > 300 && flowOf(t) === "expense") || (t.amount < 0 && /zelle|venmo|cash ?app|paypal/i.test(t.description)))))
  console.log(" ", t.date, String(t.amount).padStart(9), (t.merchant_name ?? t.description).slice(0, 38).padEnd(38), t.category, "|", flowOf(t))
