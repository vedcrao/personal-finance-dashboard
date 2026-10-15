"use client"

import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"

/**
 * Hides the native splash screen as soon as ANY page has rendered, including /login and
 * /signup, which sit outside the signed-in layout. (No-op in a normal browser.)
 */
export function SplashHider() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    document.documentElement.classList.add("native")
    void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}))
    void import("@capacitor/status-bar").then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Dark }).catch(() => {}))
  }, [])
  return null
}
