import type { Metadata } from "next"
import { H, LegalPage, Ul } from "@/components/legal/LegalPage"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = { title: "Terms & Disclaimer" }

export default function TermsPage() {
  const mail = <a href={`mailto:${LEGAL.supportEmail}`} className="font-semibold text-primary">{LEGAL.supportEmail}</a>
  return (
    <LegalPage title="Terms of Use & Disclaimer">
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-amber-100">
        <p className="font-semibold">Important disclaimer</p>
        <p className="mt-1">
          {LEGAL.appName} is an informational tool, not a bank, broker, or financial, tax, investment or legal advisor. Nothing in the app is advice or a
          recommendation. Balances, categories, totals, recurring bills, investment returns and assistant answers may be incomplete, delayed or wrong.
          Always check important numbers with your bank or brokerage before making decisions.
        </p>
      </div>

      <p>
        These terms are an agreement between you and {LEGAL.operator} (&quot;we&quot;) for using {LEGAL.appName}. By creating an account or using the app you agree
        to them and to the <a href="/privacy" className="text-primary">Privacy Policy</a>.
      </p>

      <H>Eligibility and your account</H>
      <Ul>
        <li>You must be {LEGAL.minAge} or older and able to enter a binding agreement.</li>
        <li>Only connect accounts you own or are authorized to access.</li>
        <li>Keep your password private. You&apos;re responsible for activity under your account.</li>
      </Ul>

      <H>Your Plaid keys</H>
      <p>
        The app connects to your banks through a Plaid developer account that you create and control. You&apos;re responsible for complying with
        Plaid&apos;s terms and for any fees Plaid charges your Plaid account. We store your keys encrypted and use them only to provide the app to you.
      </p>

      <H>What the app does and doesn&apos;t do</H>
      <Ul>
        <li>It has <b>read-only</b> access: it can&apos;t move money, pay bills, trade or change anything at your bank.</li>
        <li>Data comes from your financial institutions through Plaid and may be delayed, incomplete or incorrect. We aren&apos;t responsible for errors by banks or Plaid.</li>
        <li>Categories, transfer and refund matching, recurring-bill detection and assistant responses are generated automatically (partly by AI) and can be wrong. Rules and edits you make take priority.</li>
        <li>Investment values and returns are estimates based on data your brokerage reports. Past performance doesn&apos;t predict future results.</li>
      </Ul>

      <H>Acceptable use</H>
      <p>Don&apos;t misuse the app: no attempts to access other people&apos;s data, disrupt the service, reverse-engineer it to harm others, or use it for anything illegal.</p>

      <H>Availability and changes</H>
      <p>
        The app is provided as-is and may change, be interrupted, or be discontinued. We may suspend accounts that violate these terms. You can stop using
        the app and delete your account at any time from Settings.
      </p>

      <H>No warranties</H>
      <p>
        To the fullest extent permitted by law, the app is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, including accuracy,
        fitness for a particular purpose, or non-infringement.
      </p>

      <H>Limitation of liability</H>
      <p>
        To the fullest extent permitted by law, we aren&apos;t liable for indirect, incidental, special, consequential or punitive damages, or for financial
        losses resulting from decisions made using the app. Our total liability for any claim is limited to the amount you paid us for the app in the 12
        months before the claim (the app is currently free, so this is $0). Some places don&apos;t allow these limits, so they may not apply to you.
      </p>

      <H>Apple</H>
      <p>
        If you use the iOS app, these terms are between you and us, not Apple. Apple has no obligation to provide support or maintenance for the app and isn&apos;t
        responsible for claims relating to it. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them.
      </p>

      <H>Changes to these terms</H>
      <p>We may update these terms; we&apos;ll change the date above and notify you in the app for material changes. Continuing to use the app means you accept them.</p>

      <H>Contact</H>
      <p>{mail}</p>
    </LegalPage>
  )
}
