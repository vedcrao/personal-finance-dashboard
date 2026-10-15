import type { Metadata } from "next"
import { H, LegalPage, Ul } from "@/components/legal/LegalPage"
import { LEGAL, PROCESSORS } from "@/lib/legal"

export const metadata: Metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL.supportEmail}`} className="font-semibold text-primary">{LEGAL.supportEmail}</a>
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {LEGAL.appName} (&quot;the app&quot;) is a personal finance dashboard operated by {LEGAL.operator}. This policy explains what we collect,
        why, who we share it with, and how to delete it. We don&apos;t sell your data, show ads, or track you across other apps or websites.
      </p>

      <H>What we collect</H>
      <Ul>
        <li><b>Account details:</b> your username, email address and password (the password is stored hashed by our sign-in provider; we never see it).</li>
        <li><b>Your Plaid API keys:</b> the Plaid client ID and secret you provide. The secret is encrypted (AES-256) before it&apos;s stored and is never sent back to your device.</li>
        <li><b>Financial data from the banks you connect:</b> account names, types, last 4 digits, balances, credit limits, card statement details (balance, minimum payment, due date, APR), transactions (amount, date, merchant, description, location) and investment holdings and activity.</li>
        <li><b>Things you create:</b> categories, rules, savings goals, budgets and messages you send to the assistant.</li>
        <li><b>Daily balance snapshots</b> used to draw your history charts.</li>
      </Ul>
      <p>
        Full account and routing numbers are fetched from your bank only when you open them on the Accounts page, shown to you, and not stored.
        We don&apos;t collect location from your device, contacts, photos, advertising identifiers, or analytics about how you use the app.
      </p>

      <H>How we use it</H>
      <Ul>
        <li>To show your balances, spending, cards, investments and history.</li>
        <li>To automatically sync new transactions when your bank reports them.</li>
        <li>To categorize transactions, detect transfers, refunds and recurring bills, and apply your rules.</li>
        <li>To answer questions you ask the in-app assistant.</li>
      </Ul>
      <p>Your data is used only to provide the app to you. It isn&apos;t used to train AI models by us, and it isn&apos;t used for advertising.</p>

      <H>Who we share it with</H>
      <p>We share data only with the service providers that run the app:</p>
      <Ul>
        {PROCESSORS.map((p) => (
          <li key={p.name}>
            <b>{p.name}</b>: {p.what}. <a href={p.link} target="_blank" rel="noreferrer" className="text-primary">Privacy policy</a>
          </li>
        ))}
      </Ul>
      <p>
        <b>AI processing.</b> To categorize transactions and power the assistant, transaction descriptions, merchant names, amounts and dates, and your
        assistant messages, are sent to Groq (and Google&apos;s Gemini API as a backup). Most transactions are categorized with Plaid&apos;s own
        categories and never sent to an AI service. Names, email, account numbers and Plaid keys are never sent to AI services. You agree to this
        processing when you create an account; you can stop it at any time by deleting your account.
      </p>
      <p>Plaid&apos;s handling of your bank login is covered by the Plaid End User Privacy Policy. We never see or store your bank username or password.</p>
      <p>We may disclose information if required by law.</p>

      <H>Security</H>
      <p>
        Data is sent over HTTPS. Plaid secrets are encrypted at rest, database access is restricted per user, and the app has read-only access to your
        banks: it can&apos;t move money. No system is perfectly secure, so please use a strong, unique password.
      </p>

      <H>Retention and deletion</H>
      <p>
        We keep your data until you delete your account. To delete it, open <b>Settings → Delete account</b> in the app. This immediately disconnects every
        bank from Plaid and permanently deletes your profile, keys, accounts, transactions, rules, goals and history. You can also email {mail} and we&apos;ll
        delete it for you. Backups held by our providers are overwritten on their normal schedule.
      </p>

      <H>Your choices and rights</H>
      <p>
        You can disconnect banks, edit or delete your rules and goals, and delete your account at any time. Depending on where you live (for example
        California or the EU), you may have rights to access, correct, export or delete your data. Email {mail} to make a request.
      </p>

      <H>Children</H>
      <p>The app is for people {LEGAL.minAge} and older and isn&apos;t directed to children. We don&apos;t knowingly collect data from children.</p>

      <H>Changes</H>
      <p>If we change this policy we&apos;ll update the date above, and for material changes we&apos;ll notify you in the app.</p>

      <H>Contact</H>
      <p>Questions or requests: {mail}</p>
    </LegalPage>
  )
}
