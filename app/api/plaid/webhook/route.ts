import { after, NextResponse } from "next/server"
import { verifyPlaidWebhook } from "@/lib/plaid-webhook"
import { syncAndCategorize } from "@/lib/sync"
import { supabaseAdmin } from "@/lib/supabase-server"

export const maxDuration = 60

const TRANSACTION_CODES = new Set(["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"])

/**
 * Plaid calls this when an Item has new data. Plaid wants a fast 200, so the
 * actual sync runs in after() once the response has been sent.
 */
export async function POST(request: Request) {
  const raw = await request.text()
  if (!(await verifyPlaidWebhook(raw, request.headers.get("plaid-verification")))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const body = JSON.parse(raw) as {
    webhook_type: string
    webhook_code: string
    item_id?: string
    error?: { error_code?: string } | null
  }
  const { webhook_type: type, webhook_code: code, item_id: itemId } = body
  console.log(`Plaid webhook ${type}/${code} for ${itemId ?? "?"}`)

  if (type === "TRANSACTIONS" && TRANSACTION_CODES.has(code) && itemId) {
    // DEFAULT/INITIAL/HISTORICAL are legacy duplicates of SYNC_UPDATES_AVAILABLE; only act on that one
    if (code === "SYNC_UPDATES_AVAILABLE") {
      after(async () => {
        try {
          const r = await syncAndCategorize(itemId)
          console.log(`Webhook sync: +${r.synced} / -${r.removed}, ${r.categorized} categorized`)
        } catch (e) {
          console.error("Webhook sync failed:", e instanceof Error ? e.message : e)
        }
      })
    }
  } else if (type === "ITEM" && itemId) {
    const status =
      code === "ERROR" && body.error?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required"
      : code === "ERROR" ? "error"
      : code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT" ? "pending_expiration"
      : code === "LOGIN_REPAIRED" ? "ok"
      : null
    if (status) {
      await supabaseAdmin
        .from("plaid_items")
        .update({ status, status_detail: body.error?.error_code ?? code })
        .eq("plaid_item_id", itemId)
    }
  }
  // HOLDINGS / INVESTMENTS_TRANSACTIONS / LIABILITIES: those are read live on page load, nothing to store.

  return NextResponse.json({ received: true })
}
