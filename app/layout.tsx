import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { SplashHider } from "@/components/shell/SplashHider"

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: { default: "Vertice — Personal Finance", template: "%s · Vertice" },
  description: "Net worth, spending, cards and investments in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Vertice", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-512.png", apple: "/apple-touch-icon.png" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app draw under the notch / home indicator; spacing comes from env(safe-area-inset-*)
  viewportFit: "cover",
  themeColor: "#0a0f1d",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <head>
        {/* Icon font used by the Stitch designs. display=block avoids flashing ligature names ("dashboard") as text. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full">
        <SplashHider />
        {children}
      </body>
    </html>
  )
}
