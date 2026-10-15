"use client"

import { useSyncExternalStore } from "react"
import { Capacitor } from "@capacitor/core"

const noop = () => () => {}

/** True inside the iOS / Android app (Capacitor), false in a normal browser. SSR-safe. */
export function useIsNative(): boolean {
  return useSyncExternalStore(noop, () => Capacitor.isNativePlatform(), () => false)
}

/**
 * Bank linking can't run inside the app's WebView: OAuth banks (Chase, Schwab, Wells…)
 * redirect to their own sites, which Plaid only supports in a real browser or its native SDK.
 * So in the app we open the Connect page in the system browser sheet and refresh on return.
 */
export async function openInSystemBrowser(path: string) {
  const { Browser } = await import("@capacitor/browser")
  await Browser.open({ url: `${window.location.origin}${path}`, presentationStyle: "popover" })
}
