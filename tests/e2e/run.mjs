// End-to-end UI crawl (read-only). Usage: npm run test:e2e   (needs `npm run build` first)
// - starts `next start` on a free port
// - signs in as LEGACY_OWNER_EMAIL with a one-time admin magic link (revoked at the end)
// - visits every page at phone + desktop size, clicks every internal link and the key
//   buttons, and fails on: JS errors, failed API calls, 404/500 pages, broken links,
//   horizontal overflow, or a page that never finishes loading.
// Never presses Sync / Save / Delete, so your data isn't changed.
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { start } from "./cdp.mjs"

const PORT = 3600 + Math.floor(Math.random() * 300)
const BASE = `http://localhost:${PORT}`
process.env.BASE = BASE
mkdirSync(process.env.OUT ?? "/tmp/vertice-e2e", { recursive: true })

const PAGES = ["/", "/spending", "/spending?tab=recurring", "/accounts", "/cards", "/investments", "/assistant", "/connect", "/settings"]
const PUBLIC = ["/login", "/signup", "/forgot-password", "/privacy", "/terms", "/support"]
const failures = []
const fail = (where, what) => failures.push(`${where}: ${what}`)

// ---------- server ----------
const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { stdio: "ignore", env: process.env })
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/login`)).ok) break } catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500))
}

// ---------- session ----------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: process.env.LEGACY_OWNER_EMAIL })
if (linkErr) throw linkErr
const jar = []
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: { getAll: () => jar, setAll: (l) => l.forEach((c) => { const i = jar.findIndex((x) => x.name === c.name); if (i >= 0) jar.splice(i, 1); if (c.value) jar.push({ name: c.name, value: c.value }) }) },
})
const { data: session } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" })

async function crawl(mode) {
  if (mode === "desktop") process.env.DESKTOP = "1"; else delete process.env.DESKTOP
  // Public pages, signed out
  const anon = await start([])
  for (const p of PUBLIC) {
    const before = anon.issues.length
    const at = await anon.nav(p, 2500)
    if (at.startsWith("/login") && p !== "/login") fail(`${mode} ${p}`, "public page redirected to login")
    const body = await anon.text()
    if (/404|This page could not be found|Internal Server Error/.test(body)) fail(`${mode} ${p}`, "error page")
    for (const i of anon.issues.slice(before)) fail(`${mode} ${p}`, i)
    const ov = (await anon.overflowX()).filter((o) => !/pointer-events-none absolute/.test(o)) // decorative glows are clipped
    if (ov.length) fail(`${mode} ${p}`, `overflows: ${ov.slice(0, 2).join(", ")}`)
  }
  // Signed-in app: unauthenticated hit must redirect
  const bounced = await anon.nav("/accounts", 2500)
  if (!bounced.startsWith("/login")) fail(`${mode} auth`, "signed-out /accounts didn't redirect to /login")
  await anon.close()

  const b = await start(jar)
  const links = new Set()
  for (const p of PAGES) {
    const before = b.issues.length
    const at = await b.nav(p, 5500)
    if (at.startsWith("/login")) { fail(`${mode} ${p}`, "bounced to login (session not working)"); continue }
    const body = await b.text()
    if (/This page could not be found|Internal Server Error|Something went wrong on this page/.test(body)) fail(`${mode} ${p}`, "error page / error boundary")
    if (/Loading…$/.test(body.trim())) fail(`${mode} ${p}`, "stuck loading")
    for (const i of b.issues.slice(before)) fail(`${mode} ${p}`, i)
    const ov = (await b.overflowX()).filter((o) => !/pointer-events-none absolute/.test(o))
    if (ov.length) fail(`${mode} ${p}`, `overflows: ${ov.slice(0, 2).join(", ")}`)
    for (const href of await b.evaluate(`[...document.querySelectorAll("a[href^='/']")].map(a => a.getAttribute("href"))`)) links.add(href)
    await b.shot(`${mode}-${p.replace(/[/?=]/g, "_") || "home"}`)
  }

  // Every internal link resolves (no 404/500)
  for (const href of links) {
    const res = await fetch(BASE + href, { headers: { cookie: jar.map((c) => `${c.name}=${c.value}`).join("; ") }, redirect: "manual" })
    if (res.status >= 400) fail(`${mode} link`, `${href} → HTTP ${res.status}`)
  }

  // Interactions (read-only)
  const step = async (name, fn) => { const before = b.issues.length; try { await fn() } catch (e) { fail(`${mode} ${name}`, e.message) } for (const i of b.issues.slice(before)) fail(`${mode} ${name}`, i) }
  await step("overview week + day filter", async () => {
    await b.nav("/", 5000)
    await b.click("Previous week"); await b.click("Next week")
    const days = await b.evaluate(`[...document.querySelectorAll("button[aria-label*=':']")].filter(x => !x.disabled).map(x => x.getAttribute("aria-label"))`)
    if (days[0]) { await b.click(days[0].split(":")[0] + ":"); if (!(await b.text()).includes("Back to week")) throw new Error("day filter didn't open"); await b.click("Back to week") }
  })
  await step("privacy toggle", async () => { await b.click("Hide balances"); if (!(await b.text()).includes("••")) throw new Error("balances not hidden"); await b.click("Show balances") })
  await step("notifications", async () => { await b.click("Notifications"); await b.click("Notifications") })
  await step("transaction editor opens + closes", async () => {
    await b.evaluate(`document.querySelector('button[title^="Edit category"]')?.click()`); await b.sleep(900)
    if (!(await b.text()).includes("Edit transaction")) throw new Error("editor didn't open")
    await b.click("Cancel", { exact: true })
  })
  await step("spending: month scroller + list + collapse + recurring", async () => {
    await b.nav("/spending", 5000)
    await b.click("Previous month"); await b.click("Next month")
    await b.click("All transactions"); if (!(await b.text()).includes("Collapse")) throw new Error("list didn't open")
    await b.click("Collapse")
    await b.click("Recurring", { exact: true })
  })
  await step("accounts: flow chips", async () => { await b.nav("/accounts", 4500); for (const c of ["Income (+)", "Outflow", "Transfers", "All flows"]) await b.click(c) })
  await step("cards: switch card", async () => { await b.nav("/cards", 4500); await b.evaluate(`[...document.querySelectorAll('button[aria-label^="Show "]')][1]?.click()`) })
  await step("invest: account dropdown + allocation filter + collapse", async () => {
    await b.nav("/investments", 6000)
    await b.click("Choose account"); await b.evaluate(`document.querySelectorAll('[role=option] button')[0]?.click()`); await b.sleep(600)
    const slice = await b.evaluate(`[...document.querySelectorAll('button[aria-pressed]')].find(x => x.closest('section'))?.textContent?.trim().split(/\\s/)[0]`)
    if (slice) await b.click(slice)
    if ((await b.text()).includes("Show all holdings")) await b.click("Show all holdings", { wait: 600 })
    // Expand/collapse only shows when more than one account is listed
    if ((await b.text()).includes("Expand all")) { await b.click("Expand all"); await b.click("Collapse all") }
  })
  if (mode === "phone") await step("phone: More sheet → each item", async () => {
    for (const item of ["Assistant", "Connect banks", "Settings"]) {
      await b.nav("/", 3500); await b.click("More"); await b.click(item, { wait: 2500 })
      const at = await b.evaluate("location.pathname")
      if (at === "/") throw new Error(`More → ${item} didn't navigate`)
    }
  })
  await b.close()
}

try {
  await crawl("phone")
  await crawl("desktop")
} finally {
  if (session?.session) await admin.auth.admin.signOut(session.session.access_token, "local").catch(() => {})
  server.kill()
}

if (failures.length) {
  console.log(`\n✗ E2E: ${failures.length} problem(s)\n` + failures.map((f) => `  • ${f}`).join("\n"))
  process.exit(1)
}
console.log("\n✓ E2E: every page, link and interaction OK (phone + desktop)")
