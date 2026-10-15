import type { Metadata } from "next"
import { H, LegalPage, Ul } from "@/components/legal/LegalPage"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = { title: "Support" }

export default function SupportPage() {
  const mail = <a href={`mailto:${LEGAL.supportEmail}`} className="font-semibold text-primary">{LEGAL.supportEmail}</a>
  return (
    <LegalPage title="Support">
      <p>Need help? Email {mail}. We usually reply within 2 business days.</p>

      <H>Common questions</H>
      <Ul>
        <li><b>Where do I get Plaid keys?</b> Create a free account at dashboard.plaid.com, then open Developers → Keys. Use the sandbox secret for test banks or the production secret for real banks (after Plaid approves production access).</li>
        <li><b>A bank says &quot;login required&quot;.</b> Open Connect and tap Reconnect next to that bank.</li>
        <li><b>A transaction is in the wrong category.</b> Tap it, pick the category and how it counts, and tick &quot;Apply to all similar&quot; to make it stick.</li>
        <li><b>New transactions aren&apos;t showing.</b> Banks report to Plaid a few times a day. Tap Sync to check now.</li>
        <li><b>Can the app move my money?</b> No. Access is read-only.</li>
      </Ul>

      <H>Delete your account</H>
      <p>
        In the app: <b>More → Settings → Delete account</b> (on the web, the account menu in the sidebar → Settings). This disconnects every bank and permanently
        deletes your data. Or email {mail}.
      </p>
    </LegalPage>
  )
}
