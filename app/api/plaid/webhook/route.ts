import { after, NextResponse } from "next/server"
import { verifyPlaidWebhook } from "@/lib/plaid-webhook"
import { getPlaidClient } from "@/lib/plaid"
import { applyCategorization, syncAndCategorize } from "@/lib/sync"
import { supabaseAdmin } from "@/lib/supabase-server"

export const maxDuration = 60

interface WebhookBody {
  webhook_type: string
  webhook_code: string
  item_id?: string
  error?: { error_code?: string } | null
}

/**
 * Plaid calls this when an Item has new data. Every user brings their own Plaid
 * keys, so we find the Item's owner first and verify the signature with *their* client.
 * Plaid wants a fast 200; the sync itself runs in after().
 */
export async function POST(request: Request) {
  const raw = await request.text()
  let body: WebhookBody
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const { webhook_type: type, webhook_code: code, item_id: itemId } = body
  if (!itemId) return NextResponse.json({ error: "No item" }, { status: 400 })

  const { data: item } = await supabaseAdmin.from("plaid_items").select("user_id").eq("plaid_item_id", itemId).maybeSingle()
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 })
  const userId = item.user_id as string

  let plaid
  try {
    plaid = await getPlaidClient(userId)
  } catch {
    return NextResponse.json({ error: "Owner has no Plaid keys" }, { status: 401 })
  }
  if (!(await verifyPlaidWebhook(plaid, raw, request.headers.get("plaid-verification")))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  console.log(`Plaid webhook ${type}/${code} for ${itemId}`)

  // DEFAULT/INITIAL/HISTORICAL_UPDATE are legacy duplicates; SYNC_UPDATES_AVAILABLE is the one to act on
  if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") {
    after(async () => {
      try {
        const r = await syncAndCategorize(userId, itemId, { budgetMs: 20_000 })
        let remaining = r.remaining
        if (remaining > 0) remaining = (await applyCategorization(userId, "uncategorized", { budgetMs: 20_000 })).remaining
        console.log(`Webhook sync: +${r.synced} / -${r.removed}, ${r.categorized} categorized, ${remaining} left`)
      } catch (e) {
        console.error("Webhook sync failed:", e instanceof Error ? e.message : e)
      }
    })
  } else if (type === "ITEM") {
    const status =
      code === "ERROR" && body.error?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required"
      : code === "ERROR" ? "error"
      : code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT" ? "pending_expiration"
      : code === "LOGIN_REPAIRED" ? "ok"
      : null
    if (status) {
      await supabaseAdmin.from("plaid_items").update({ status, status_detail: body.error?.error_code ?? code }).eq("plaid_item_id", itemId)
    }
  }
  // HOLDINGS / INVESTMENTS_TRANSACTIONS / LIABILITIES are read live on page load.

  return NextResponse.json({ received: true })
}
