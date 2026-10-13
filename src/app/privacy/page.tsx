import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * Thabaal's privacy policy (public: no login needed, so Meta's app review and anyone else can read
 * it). Written from what the portal actually stores and where it sends it; when a feature changes
 * what data the portal handles, update the matching section and LAST_UPDATED.
 *
 * Contact details come from environment variables so they can change without a code edit:
 *   NEXT_PUBLIC_PRIVACY_EMAIL (falls back to NEXT_PUBLIC_SALES_EMAIL, then privacy@thabaal.in)
 *   NEXT_PUBLIC_LEGAL_NAME, NEXT_PUBLIC_LEGAL_ADDRESS, NEXT_PUBLIC_GRIEVANCE_OFFICER
 *   NEXT_PUBLIC_SALES_WHATSAPP (shown as a second way to reach us when set)
 */

const LAST_UPDATED = "13 October 2026";
const EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_SALES_EMAIL || "privacy@thabaal.in";
const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME || "Thabaal";
const ADDRESS = process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "India";
const OFFICER = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER || "Grievance Officer, Thabaal";
const WHATSAPP = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Thabaal collects, uses, stores and protects personal data, and how to exercise your rights under India's Digital Personal Data Protection Act.",
  robots: { index: true, follow: true },
};

const SECTIONS = [
  ["who-we-are", "Who we are"],
  ["our-role", "Our role: whose data, whose decision"],
  ["what-we-collect", "What we collect"],
  ["how-we-use", "How we use it"],
  ["ai", "AI-assisted features"],
  ["consent", "Consent, opt-in and opt-out"],
  ["sharing", "Who we share it with"],
  ["transfers", "Where your data is stored"],
  ["retention", "How long we keep it"],
  ["security", "How we protect it"],
  ["cookies", "Cookies and local storage"],
  ["your-rights", "Your rights"],
  ["delete-your-data", "Deleting your data"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact and grievances"],
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

function Mail() {
  return (
    <a href={`mailto:${EMAIL}`} className="font-medium text-brand-deep underline underline-offset-2">
      {EMAIL}
    </a>
  );
}

export default function PrivacyPage() {
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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>

        <div className="mt-6 rounded-card border border-line bg-panel p-4 text-[0.9375rem] leading-relaxed text-ink-2 sm:p-5">
          <p>
            <strong className="text-ink">In short:</strong> Thabaal helps businesses talk to their customers on WhatsApp: campaigns, replies, orders, payments and calls. We
            only use personal data to run that service for the business that collected it. We don&apos;t sell it, we don&apos;t use it for advertising, and customers can stop
            messages at any time by replying <strong className="text-ink">STOP</strong>.
          </p>
        </div>

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
          <Section id="who-we-are" title="1. Who we are">
            <p>
              Thabaal (தபால்) is a customer-messaging portal at <strong>thabaal.in</strong>, run by {LEGAL_NAME}, {ADDRESS} (&ldquo;Thabaal&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo;). Businesses (&ldquo;clients&rdquo;) use it to send WhatsApp messages and campaigns through Meta&apos;s official WhatsApp Business Platform, answer
              replies and calls, take orders and request payments.
            </p>
            <p>This policy covers two groups of people:</p>
            <ul>
              <li>
                <strong>Portal users:</strong> the business owners and staff who sign in to Thabaal.
              </li>
              <li>
                <strong>Customers:</strong> the people our clients message on WhatsApp, whose details our clients keep in Thabaal.
              </li>
            </ul>
            <p>
              We follow India&apos;s Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and its Rules, and the Information Technology Act, 2000. Words like
              &ldquo;Data Fiduciary&rdquo;, &ldquo;Data Processor&rdquo; and &ldquo;Data Principal&rdquo; have the meanings those laws give them.
            </p>
          </Section>

          <Section id="our-role" title="2. Our role: whose data, whose decision">
            <ul>
              <li>
                <strong>For portal users&apos; account data</strong>, Thabaal decides why and how it is used, so we are the <strong>Data Fiduciary</strong>.
              </li>
              <li>
                <strong>For customer data</strong>, the business you deal with decides whom to message and why. That business is the <strong>Data Fiduciary</strong>, and
                Thabaal is its <strong>Data Processor</strong>: we process the data only on its instructions and only to provide our service to it.
              </li>
            </ul>
            <p>
              If you are a customer and want to know what a business holds about you, or want it corrected or deleted, the quickest route is to ask that business. You can also
              write to us and we will pass your request on and help them act on it (see <a href="#your-rights" className="text-brand-deep underline underline-offset-2">Your rights</a>).
            </p>
          </Section>

          <Section id="what-we-collect" title="3. What we collect">
            <p>
              <strong>About portal users</strong>
            </p>
            <ul>
              <li>Name, email address, role (owner, manager or staff) and which business you belong to.</li>
              <li>
                Your password, stored only as a one-way bcrypt hash. We never see or store it in readable form. If you choose &ldquo;Continue with Google&rdquo;, Google shares your
                name, email address and profile picture with us, and we use the email to find your account.
              </li>
              <li>What you do in the portal where it matters for the business, for example who answered a call, recorded a payment or sent a campaign.</li>
            </ul>
            <p>
              <strong>About client businesses</strong>
            </p>
            <ul>
              <li>Business name, logo, colours and tagline; the business&apos;s WhatsApp Business Account, phone number IDs and display names.</li>
              <li>Meta access tokens needed to send messages (kept on our servers and never shown back in the portal).</li>
              <li>Sending rules, plan settings, wallet top-ups and WhatsApp message costs.</li>
            </ul>
            <p>
              <strong>About customers</strong> (processed for the business that holds them)
            </p>
            <ul>
              <li>Name and WhatsApp phone number.</li>
              <li>Area or location, and purchase notes, for example as written on the business&apos;s order sheets.</li>
              <li>Tags and groups the business assigns, loyalty points, and simple measures such as how recently and how often you buy.</li>
              <li>When and how you agreed to receive messages, and whether you have opted out.</li>
              <li>Messages the business sends you and their delivery and read status; messages, photos, files and button taps you send to the business.</li>
              <li>Orders placed through WhatsApp (items, amounts and, if you give it, a delivery address).</li>
              <li>
                Payment status for an order: amount, method and the UPI transaction reference. Card numbers, bank account details and UPI PINs never reach Thabaal.
              </li>
              <li>
                WhatsApp calls with the business: number, name, time, duration and outcome. Call audio passes live between Meta and the person answering in their browser. It is{" "}
                <strong>not recorded or stored</strong>.
              </li>
            </ul>
            <p>
              <strong>Collected automatically:</strong> basic technical data needed to run and secure the service, such as IP address, browser type and error logs kept by our hosting
              provider.
            </p>
          </Section>

          <Section id="how-we-use" title="4. How we use it">
            <ul>
              <li>To send the messages, campaigns, reminders and payment requests a business sets up, and to deliver their replies and calls.</li>
              <li>To record orders and payments, and to show the business reports (deliveries, reads, replies, sales, best times to message).</li>
              <li>To respect opt-outs and keep within WhatsApp&apos;s sending limits and quality rules.</li>
              <li>To sign you in, keep accounts secure, prevent misuse, and give support.</li>
              <li>To work out each business&apos;s WhatsApp messaging costs and wallet balance.</li>
              <li>To meet legal obligations, such as tax records or lawful requests from authorities.</li>
            </ul>
            <p>
              We <strong>do not</strong> sell personal data, use it for advertising, or combine one business&apos;s customer list with another&apos;s. Each business sees only its own
              customers.
            </p>
          </Section>

          <Section id="ai" title="5. AI-assisted features">
            <p>
              Some optional tools use artificial intelligence to save time: suggested replies, a template writer, reading an order out of a pasted chat, follow-up messages, audience
              filters and a business assistant that answers questions about the business&apos;s own figures.
            </p>
            <ul>
              <li>
                When a portal user uses one of these, the text needed for that task (for example a customer&apos;s recent messages, or the chat pasted in) is sent to an AI
                provider, <strong>Google (Gemini API)</strong> or <strong>Groq</strong>, which returns a suggestion.
              </li>
              <li>We send only what the task needs. Passwords, access tokens and payment details are never sent.</li>
              <li>The output is a suggestion. A person at the business reviews it and decides whether to use it; nothing is sent to a customer automatically by these tools.</li>
            </ul>
          </Section>

          <Section id="consent" title="6. Consent, opt-in and opt-out">
            <ul>
              <li>
                Businesses must have a customer&apos;s permission before sending them WhatsApp messages, as Meta&apos;s WhatsApp Business policies and Indian law require.
                Thabaal records how and when each customer agreed (for example a QR sign-up or an order form).
              </li>
              <li>
                Customers can stop marketing messages at any time by replying <strong>STOP</strong>. They are marked as opted out for that business straight away and its campaigns
                skip them.
              </li>
              <li>Portal users agree to this policy when they create an account or sign in. They can withdraw by closing their account (see below).</li>
            </ul>
          </Section>

          <Section id="sharing" title="7. Who we share it with">
            <p>We share data only with the service providers that run Thabaal, each bound by their own terms and security commitments:</p>
            <ul>
              <li>
                <strong>Meta Platforms</strong> (WhatsApp Business Platform): every WhatsApp message, call and catalogue order passes through Meta. Meta&apos;s own privacy policy
                and the WhatsApp Business terms apply to that part.
              </li>
              <li>
                <strong>Vercel</strong>: hosts the website and stores uploaded images (Vercel Blob).
              </li>
              <li>
                <strong>Neon</strong>: our database provider.
              </li>
              <li>
                <strong>Google</strong>: &ldquo;Continue with Google&rdquo; sign-in, the Gemini AI features, and, where Google Sheets sync is switched on, copying customer
                and order details to the business&apos;s Google Sheet.
              </li>
              <li>
                <strong>Groq</strong>: AI features.
              </li>
              <li>
                If a business connects through its own WhatsApp app session instead of Meta&apos;s Cloud API, its messages pass through that session, which the business controls.
              </li>
            </ul>
            <p>
              We may also disclose data when the law requires it, to protect people&apos;s safety or our rights, or to a buyer if Thabaal&apos;s business is sold. In that case this
              policy would still protect it.
            </p>
          </Section>

          <Section id="transfers" title="8. Where your data is stored">
            <p>
              Our servers and database are located in the <strong>United States</strong> (Vercel and Neon, US East). The DPDP Act allows this transfer unless the Government of
              India restricts transfers to a country. We choose established providers that encrypt data in transit and at rest.
            </p>
          </Section>

          <Section id="retention" title="9. How long we keep it">
            <ul>
              <li>
                <strong>Portal user accounts:</strong> while the account is active. After it is closed, deleted within 30 days.
              </li>
              <li>
                <strong>Customer data:</strong> for as long as the business uses Thabaal and keeps it. When a business deletes a customer, or stops using Thabaal and asks us to,
                we delete it within 30 days.
              </li>
              <li>
                <strong>Opt-outs:</strong> a phone number that opted out is kept only so we keep honouring that choice.
              </li>
              <li>
                <strong>Logs and records the law requires:</strong> processing logs for at least one year, as the DPDP Rules require, and billing and tax records for as long as
                Indian tax law requires. These are then deleted.
              </li>
            </ul>
          </Section>

          <Section id="security" title="10. How we protect it">
            <ul>
              <li>All connections use HTTPS; data is encrypted in transit and stored with providers that encrypt it at rest.</li>
              <li>Passwords are stored as bcrypt hashes. Sign-in uses a signed, HttpOnly cookie that browser scripts can&apos;t read.</li>
              <li>Each business can only reach its own data, and staff accounts can be limited to what their role needs.</li>
              <li>Messages from Meta are checked against Meta&apos;s signature before we accept them. Access tokens stay on the server.</li>
            </ul>
            <p>
              No system is perfectly secure. If a personal data breach happens, we will inform affected businesses and users and the Data Protection Board of India within the time
              the law sets, and tell you what we are doing about it.
            </p>
          </Section>

          <Section id="cookies" title="11. Cookies and local storage">
            <p>We use only the cookies the portal needs to work. There are no advertising or third-party tracking cookies.</p>
            <ul>
              <li>
                <strong>wp_session</strong>: keeps you signed in (up to 7 days).
              </li>
              <li>
                <strong>wp_client</strong>: remembers which business an administrator is viewing.
              </li>
              <li>
                <strong>wp_oauth_state</strong>: protects &ldquo;Continue with Google&rdquo; sign-in (10 minutes).
              </li>
              <li>Your browser&apos;s local storage remembers display choices such as light or dark mode and language. It stays on your device.</li>
            </ul>
          </Section>

          <Section id="your-rights" title="12. Your rights">
            <p>Under the DPDP Act you can:</p>
            <ul>
              <li>get a summary of the personal data we process about you and whom it was shared with;</li>
              <li>have inaccurate or incomplete data corrected, completed or updated;</li>
              <li>have your data erased when it is no longer needed or you withdraw consent;</li>
              <li>withdraw consent at any time (customers can simply reply STOP);</li>
              <li>nominate someone to act for you if you die or become unable to act;</li>
              <li>have your grievances addressed, and then complain to the Data Protection Board of India if you are not satisfied.</li>
            </ul>
            <p>
              Email <Mail /> from the email address or WhatsApp number concerned, so we can confirm it is you. Customers: we will work with the business that holds your data.
              We reply within 30 days at the latest, and always within the 90 days the DPDP Rules allow.
            </p>
          </Section>

          <Section id="delete-your-data" title="13. Deleting your data">
            <p>
              <strong>Portal users:</strong> ask your business owner to remove your login, or email <Mail /> from your account&apos;s email address with the subject
              &ldquo;Delete my account&rdquo;. We delete your account and sign-in details within 30 days and confirm by email.
            </p>
            <p>
              <strong>Customers of a business:</strong> reply <strong>STOP</strong> to stop marketing messages at once. To have your details deleted, ask the business, or email{" "}
              <Mail /> with your WhatsApp number and the business&apos;s name. We confirm once it is done, within 30 days.
            </p>
            <p>
              <strong>If you connected through Facebook or WhatsApp sign-up:</strong> you can also remove Thabaal&apos;s access in your Facebook or Meta Business settings (Business
              integrations). Then email us as above and we delete the related data.
            </p>
            <p>Records we must keep by law (for example tax records) are kept only for that purpose and deleted when the period ends.</p>
          </Section>

          <Section id="children" title="14. Children">
            <p>
              Thabaal is a tool for businesses and is not meant for anyone under 18. We do not knowingly collect children&apos;s data. Businesses must not use Thabaal to message
              children without verifiable consent from a parent or guardian. If you believe a child&apos;s data is in Thabaal, email <Mail /> and we will delete it.
            </p>
          </Section>

          <Section id="changes" title="15. Changes to this policy">
            <p>
              We will update this page when our service or the law changes, and change the date at the top. For important changes we will tell portal users in the portal or by
              email before they take effect.
            </p>
          </Section>

          <Section id="contact" title="16. Contact and grievances">
            <p>
              For privacy questions, requests or complaints, contact our Grievance Officer:
            </p>
            <div className="rounded-card border border-line bg-panel p-4 text-sm leading-relaxed">
              <p className="font-semibold text-ink">{OFFICER}</p>
              {LEGAL_NAME !== "Thabaal" && <p>{LEGAL_NAME}</p>}
              <p>{ADDRESS}</p>
              <p className="mt-1">
                Email: <Mail />
              </p>
              {WHATSAPP && (
                <p>
                  WhatsApp:{" "}
                  <a href={`https://wa.me/${WHATSAPP}`} className="font-medium text-brand-deep underline underline-offset-2">
                    +{WHATSAPP}
                  </a>
                </p>
              )}
            </div>
            <p>
              We acknowledge complaints within 2 working days and aim to resolve them within 30 days. If you are not satisfied, you can complain to the{" "}
              <strong>Data Protection Board of India</strong>.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Thabaal · A message with momentum</span>
          <span className="flex gap-4">
            <Link href="/terms" className="hover:text-ink">
              Terms
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
