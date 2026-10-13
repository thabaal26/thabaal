import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * Thabaal's Terms of Service (public, like /privacy). Contact details come from the same
 * environment variables as the privacy policy; update LAST_UPDATED when the text changes.
 */

const LAST_UPDATED = "13 October 2026";
const EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_SALES_EMAIL || "privacy@thabaal.in";
const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME || "Thabaal";
const ADDRESS = process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "India";
const JURISDICTION = process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "India";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Thabaal, the WhatsApp customer-messaging portal.",
  robots: { index: true, follow: true },
};

const SECTIONS = [
  ["agreement", "Agreement"],
  ["service", "The service"],
  ["accounts", "Accounts and access"],
  ["whatsapp-rules", "Using WhatsApp responsibly"],
  ["fees", "Fees, Meta charges and wallet"],
  ["your-data", "Your data"],
  ["ai", "AI suggestions"],
  ["availability", "Availability and changes"],
  ["ip", "Ownership"],
  ["suspension", "Suspension and ending"],
  ["liability", "Liability"],
  ["law", "Governing law"],
  ["contact", "Contact"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-7 sm:pt-9">
      <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

const Mail = () => (
  <a href={`mailto:${EMAIL}`} className="font-medium text-brand-deep underline underline-offset-2">
    {EMAIL}
  </a>
);

const Privacy = ({ children = "Privacy Policy" }: { children?: ReactNode }) => (
  <Link href="/privacy" className="font-medium text-brand-deep underline underline-offset-2">
    {children}
  </Link>
);

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/login" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src="/brands/thabaal/thabaal-logo-en-sm.png" alt="Thabaal" width={108} height={36} className="h-9 w-auto" />
          </Link>
          <Link href="/login" className="text-sm font-medium text-brand-deep hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Legal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>

        <nav aria-label="On this page" className="mt-6 rounded-card border border-line bg-panel p-4 sm:p-5">
          <p className="text-sm font-semibold text-ink">On this page</p>
          <ol className="mt-2 grid list-decimal gap-x-6 gap-y-1 pl-5 text-sm text-ink-2 sm:grid-cols-2">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-brand-deep hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8 sm:space-y-10">
          <Section id="agreement" title="1. Agreement">
            <p>
              These terms are an agreement between {LEGAL_NAME}, {ADDRESS} (&ldquo;Thabaal&rdquo;, &ldquo;we&rdquo;) and the business that uses Thabaal (&ldquo;you&rdquo;,
              the &ldquo;client&rdquo;), including everyone who signs in for that business. By creating an account or signing in, you accept these terms and our <Privacy />. If
              you sign in for a business, you confirm you are allowed to accept them for it.
            </p>
          </Section>

          <Section id="service" title="2. The service">
            <p>
              Thabaal is a web portal for sending WhatsApp messages and campaigns through Meta&apos;s WhatsApp Business Platform, handling replies and calls, taking orders and
              requesting payments, and seeing reports. Features can depend on the plan agreed with you and on what Meta allows for your WhatsApp account.
            </p>
          </Section>

          <Section id="accounts" title="3. Accounts and access">
            <ul>
              <li>Keep your sign-in details secret and tell us at once if you think someone else has used them.</li>
              <li>You decide who in your business gets a login and at what access level, and you are responsible for what they do in the portal.</li>
              <li>Give accurate business details. We may ask you to verify them, as Meta also does.</li>
            </ul>
          </Section>

          <Section id="whatsapp-rules" title="4. Using WhatsApp responsibly">
            <p>You must follow Meta&apos;s WhatsApp Business Terms, WhatsApp Business Messaging Policy and Commerce Policy, and Indian law. In particular:</p>
            <ul>
              <li>Message only people who have agreed to hear from you, and keep a record of that agreement (Thabaal stores it for you).</li>
              <li>Stop marketing to anyone who opts out. Thabaal does this automatically when a customer replies STOP; don&apos;t work around it.</li>
              <li>Don&apos;t send spam, misleading or illegal content, or sell goods WhatsApp doesn&apos;t allow.</li>
              <li>Don&apos;t upload data you have no right to use, or anyone&apos;s data you collected without a lawful basis.</li>
            </ul>
            <p>
              Meta can limit, flag or block WhatsApp numbers whose messages customers report. We are not responsible for Meta&apos;s decisions, but we will help you understand
              and fix them.
            </p>
          </Section>

          <Section id="fees" title="5. Fees, Meta charges and wallet">
            <ul>
              <li>You pay the fees agreed with Thabaal for the portal, if any.</li>
              <li>
                Meta charges for delivered template messages at its published rates, plus GST. These charges are paid from the WhatsApp account&apos;s prepaid balance or
                payment method, or from your Thabaal wallet when we manage billing for you.
              </li>
              <li>
                Wallet money is used only for your messaging costs. Sending can pause when the balance runs out. Unused wallet balance is refunded when you leave, less charges
                already incurred.
              </li>
              <li>Prices and Meta&apos;s rates can change. We will tell you before our own prices change.</li>
            </ul>
          </Section>

          <Section id="your-data" title="6. Your data">
            <p>
              Your customer lists, messages, orders and other content belong to you. You give us permission to process them only to provide Thabaal to you. For that data you
              are the Data Fiduciary and we are your Data Processor under India&apos;s DPDP Act. The <Privacy /> explains what we collect and how we protect it. You can export
              or ask us to delete your data at any time.
            </p>
          </Section>

          <Section id="ai" title="7. AI suggestions">
            <p>
              Optional AI tools suggest replies, templates and summaries. Suggestions can be wrong. Check them before sending; you are responsible for what you send. Using these
              tools sends the relevant text to our AI providers, as the <Privacy /> describes.
            </p>
          </Section>

          <Section id="availability" title="8. Availability and changes">
            <p>
              We work to keep Thabaal running well, but it depends on Meta, internet and hosting services, so we can&apos;t promise it will never be interrupted. We may improve
              or change features. If a change takes away something important you rely on, we will tell you in advance where we can.
            </p>
          </Section>

          <Section id="ip" title="9. Ownership">
            <p>
              Thabaal&apos;s software, design, name and logo belong to us. You may use the portal for your business while these terms apply, but not copy, resell or
              reverse-engineer it. WhatsApp and Meta are trademarks of Meta Platforms, Inc.; Thabaal is not affiliated with or endorsed by Meta.
            </p>
          </Section>

          <Section id="suspension" title="10. Suspension and ending">
            <ul>
              <li>You can stop using Thabaal at any time by telling us.</li>
              <li>
                We may suspend or close an account that breaks these terms or Meta&apos;s policies, puts others at risk, or doesn&apos;t pay. Where possible we will warn you first
                and give you a chance to fix it.
              </li>
              <li>When an account ends, you can ask for an export of your data. We then delete it as the Privacy Policy describes.</li>
            </ul>
          </Section>

          <Section id="liability" title="11. Liability">
            <p>
              To the extent the law allows, Thabaal is not liable for indirect losses such as lost profits, lost sales or business interruption, or for problems caused by Meta,
              WhatsApp, payment apps or your own content. Our total liability for any claim is limited to the fees you paid Thabaal in the three months before the claim. Nothing
              in these terms limits liability that cannot legally be limited.
            </p>
            <p>You agree to cover us for claims that arise from messages you send or data you upload in breach of these terms or the law.</p>
          </Section>

          <Section id="law" title="12. Governing law">
            <p>
              These terms are governed by the laws of India. Disputes will first be discussed in good faith; if they can&apos;t be settled, the courts of {JURISDICTION} have
              jurisdiction. We may update these terms; the date at the top shows the latest version, and we will tell you about important changes before they apply.
            </p>
          </Section>

          <Section id="contact" title="13. Contact">
            <p>
              Questions about these terms: <Mail />.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Thabaal · A message with momentum</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/login" className="hover:text-ink">
              thabaal.in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
