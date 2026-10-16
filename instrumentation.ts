import type { Instrumentation } from "next"

/** Every unhandled server error (API routes, pages) → error_logs table. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string }
  const { logError } = await import("./lib/errors")
  await logError({
    source: "server",
    message: e.message ?? String(err),
    stack: e.stack ?? null,
    path: `${request.method} ${request.path}`,
    context: { routePath: context.routePath, routeType: context.routeType, digest: e.digest },
  })
}
