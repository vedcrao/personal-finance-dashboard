// Shared details for /privacy, /terms and /support. Review before publishing; not legal advice.
export const LEGAL = {
  appName: "Vertice",
  operator: "Ved Rao",
  // Shown publicly on the legal/support pages. Override with NEXT_PUBLIC_SUPPORT_EMAIL.
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "vedcrao@gmail.com",
  effectiveDate: "October 15, 2026",
  minAge: 18,
}

/** Third parties that receive user data, used in the privacy policy and the sign-up consent. */
export const PROCESSORS = [
  { name: "Plaid", what: "Connects to your bank and provides account, balance, transaction, investment and card statement data", link: "https://plaid.com/legal/#end-user-privacy-policy" },
  { name: "Supabase", what: "Hosts the database and handles sign-in", link: "https://supabase.com/privacy" },
  { name: "Vercel", what: "Hosts the app and runs its servers", link: "https://vercel.com/legal/privacy-policy" },
  { name: "Groq", what: "AI service: receives transaction descriptions, amounts and dates to categorize them, and your messages to the in-app assistant", link: "https://groq.com/privacy-policy" },
  { name: "Google (Gemini API)", what: "Backup AI service for categorization when Groq is unavailable (same data as Groq)", link: "https://policies.google.com/privacy" },
]
