"use client"

import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { useFinance } from "@/components/providers/FinanceProvider"

/** Native-only glue (no-op in the browser): status bar, splash screen, refresh on resume. */
export function NativeBridge() {
  const { refresh } = useFinance()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    document.documentElement.classList.add("native")
    const cleanups: (() => void)[] = []
    let cancelled = false

    void (async () => {
      const [{ StatusBar, Style }, { SplashScreen }, { App }, { Browser }] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/app"),
        import("@capacitor/browser"),
      ])
      if (cancelled) return
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
      if (Capacitor.getPlatform() === "android") await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
      await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})

      // Coming back to the app (or closing the bank-linking browser) → pull fresh data
      const resume = await App.addListener("resume", () => void refresh())
      const browserDone = await Browser.addListener("browserFinished", () => void refresh())
      // Android hardware back button: go back in history instead of closing the app
      const back = await App.addListener("backButton", ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp()))
      cleanups.push(() => void resume.remove(), () => void browserDone.remove(), () => void back.remove())
    })()

    return () => {
      cancelled = true
      cleanups.forEach((c) => c())
    }
  }, [refresh])

  return null
}
