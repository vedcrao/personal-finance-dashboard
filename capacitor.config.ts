import type { CapacitorConfig } from "@capacitor/cli"

/**
 * The native app is a shell around the deployed site: everything (Plaid, Supabase,
 * webhooks, assistant) runs server-side on Vercel, so pages can't be bundled offline.
 * `native-shell/` is only the fallback shown when there's no connection.
 *
 * Point at another deployment (e.g. a preview or localhost on your LAN) with:
 *   CAP_SERVER_URL=http://192.168.1.20:3000 npx cap sync
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://personal-finance-dashboard-hazel-xi.vercel.app"

const config: CapacitorConfig = {
  appId: "com.vedcrao.vertice",
  appName: "Vertice",
  webDir: "native-shell",
  backgroundColor: "#0a0f1d",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
    allowNavigation: [new URL(serverUrl).hostname],
  },
  ios: {
    // We handle notch / home-indicator spacing in CSS with env(safe-area-inset-*)
    contentInset: "never",
    backgroundColor: "#0a0f1d",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#0a0f1d",
  },
  plugins: {
    SplashScreen: {
      // Safety net: never stay up longer than this, even if the page fails to load.
      // Normally SplashHider (app/layout.tsx) hides it sooner, once the first page renders.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: "#0a0f1d",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0f1d",
      overlaysWebView: true,
    },
  },
}

export default config
