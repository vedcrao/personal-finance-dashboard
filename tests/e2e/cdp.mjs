// Minimal Chrome DevTools Protocol driver (no deps): iPhone viewport, auth cookies,
// navigate / click by text / screenshot, and collect JS errors + failed API calls.
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const OUT = process.env.OUT ?? "/tmp/vertice-e2e"

export async function start(cookies = []) {
  // Read at call time: the runner sets BASE / DESKTOP before each crawl
  const BASE = process.env.BASE ?? "http://localhost:3470"
  const MOBILE = process.env.DESKTOP ? null : { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  const port = 9300 + Math.floor(Math.random() * 500)
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", "--disable-gpu", `--user-data-dir=/tmp/e2e-profile-${port}`, "about:blank"], { stdio: "ignore" })
  let ws
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === "page")
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  await new Promise((r) => ws.addEventListener("open", r, { once: true }))
  let id = 0
  const pending = new Map()
  const issues = []
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
    if (msg.method === "Runtime.exceptionThrown") issues.push(`JS exception: ${msg.params.exceptionDetails.exception?.description?.split("\n")[0] ?? msg.params.exceptionDetails.text}`)
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") issues.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`)
    if (msg.method === "Network.responseReceived") {
      const r = msg.params.response
      if (r.url.includes("/api/") && r.status >= 400) issues.push(`HTTP ${r.status} ${new URL(r.url).pathname}`)
    }
  })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id
    pending.set(i, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)))
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable")
  if (MOBILE) {
    await send("Emulation.setDeviceMetricsOverride", MOBILE)
    await send("Emulation.setTouchEmulationEnabled", { enabled: true })
    await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  } else {
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  }
  const host = new URL(BASE).hostname
  for (const c of cookies) {
    await send("Network.setCookie", { name: c.name, value: c.value, domain: host, path: "/", httpOnly: false, secure: false })
  }

  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const api = {
    issues,
    evaluate,
    sleep,
    async nav(path, wait = 3500) {
      await send("Page.navigate", { url: BASE + path })
      await sleep(wait)
      return evaluate("location.pathname + location.search")
    },
    async shot(name, full = false) {
      const opts = { format: "png" }
      if (full) {
        const h = await evaluate("Math.min(document.documentElement.scrollHeight, 6000)")
        opts.clip = { x: 0, y: 0, width: MOBILE ? MOBILE.width : 1440, height: h, scale: 1 }
        opts.captureBeyondViewport = true
      }
      const { data } = await send("Page.captureScreenshot", opts)
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"))
    },
    /** Click the first visible element whose text (or aria-label) contains `text`. */
    async click(text, { exact = false, wait = 900, within = "" } = {}) {
      const ok = await evaluate(`(() => {
        const t = ${JSON.stringify(text)}.toLowerCase()
        const root = ${within ? `document.querySelector(${JSON.stringify(within)})` : "document"} || document
        const els = [...root.querySelectorAll("button, a, [role=tab], [role=option], input[type=checkbox]")]
        const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" }
        // Material icon ligatures (e.g. "chevron_left") are text too: strip them
        const clean = (e) => { const c = e.cloneNode(true); c.querySelectorAll(".material-symbols-outlined").forEach((i) => i.remove()); return c.textContent || "" }
        const norm = (s) => (s || "").trim().toLowerCase().replace(/\\s+/g, " ")
        const cands = (e) => [norm(clean(e)), norm(e.getAttribute("aria-label")), norm(e.getAttribute("title"))]
        const el = els.find((e) => vis(e) && cands(e).some((x) => x && (${exact} ? x === t : x.includes(t))))
        if (!el) return false
        el.scrollIntoView({ block: "center" }); el.click(); return true
      })()`)
      await sleep(wait)
      if (!ok) issues.push(`could not find clickable "${text}"`)
      return ok
    },
    /** Text content checks */
    text: () => evaluate("document.body.innerText"),
    overflowX: () => evaluate("(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && getComputedStyle(e).position !== 'fixed' }).slice(0, 5).map(e => (e.className?.toString?.() || e.tagName).slice(0, 60) + ' right=' + Math.round(e.getBoundingClientRect().right)) })()"),
    truncated: () => evaluate("(() => [...document.querySelectorAll('main .truncate')].filter(e => e.scrollWidth > e.clientWidth + 1 && e.innerText.trim()).slice(0, 8).map(e => e.innerText.trim().slice(0, 40)))()"),
    async close() { ws.close(); proc.kill() },
  }
  return api
}
