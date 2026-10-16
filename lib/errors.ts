import { supabaseAdmin } from "./supabase-server"

/** Never throws: monitoring must not break the request it's reporting on. */
export async function logError(e: {
  source: "server" | "client"
  message: string
  stack?: string | null
  path?: string | null
  userId?: string | null
  userAgent?: string | null
  context?: Record<string, unknown>
}) {
  try {
    await supabaseAdmin.from("error_logs").insert({
      source: e.source,
      message: e.message.slice(0, 2000),
      stack: e.stack?.slice(0, 8000) ?? null,
      path: e.path?.slice(0, 500) ?? null,
      user_id: e.userId ?? null,
      user_agent: e.userAgent?.slice(0, 300) ?? null,
      context: e.context ?? null,
    })
  } catch {
    // table missing or DB down: nothing else to do
  }
}
