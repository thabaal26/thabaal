import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/*
 * The public homepage (www.thabaal.in). It says what Thabaal is and why "Continue with Google" asks
 * for a name, email and photo, and links the Privacy Policy and Terms, which Google's OAuth review
 * needs to see without signing in. Someone already signed in goes straight to the dashboard.
 */

export const metadata: Metadata = {
  title: { absolute: "Thabaal · WhatsApp customer messaging, campaigns and orders" },
  description:
    "Thabaal is a web portal for businesses to send WhatsApp campaigns, answer customers, take orders and request payments, and see reports, through Meta's official WhatsApp Business Platform.",
  alternates: { canonical: "https://www.thabaal.in/" },
  robots: { index: true, follow: true },
};

async function signedIn() {
  const token = (await cookies()).get("wp_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

const FEATURES: [string, string][] = [
  ["WhatsApp campaigns", "Send approved template messages to customers who opted in, schedule them, and see who received, read and replied."],
  ["One shared inbox", "Answer customer chats and calls from one place, with quick replies and optional AI-suggested answers you check before sending."],
  ["Orders and payments", "Take orders from your WhatsApp catalogue, send payment requests and follow every order to delivery."],
  ["Reports", "Track message spend, delivery, replies, orders and repeat customers on clear dashboards."],
];

const STEPS: [string, string][] = [
  ["Connect", "A business links its own WhatsApp Business number through Meta. Messages go through Meta's official WhatsApp Business Platform."],
  ["Reach customers", "Upload or sync customers who agreed to hear from you, pick a template and send. Opt-outs (STOP) are honoured automatically."],
  ["Serve and sell", "Replies, orders and payments come back into Thabaal, so the team can serve customers and see results."],
];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-panel p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

const linkCls = "font-medium text-brand-deep underline underline-offset-2";

export default async function Home() {
  if (await signedIn()) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Thabaal home">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src="/brands/thabaal/thabaal-logo-en-sm.png" alt="Thabaal" width={108} height={36} className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/privacy" className="hidden text-ink-2 hover:text-ink sm:inline">
              Privacy
            </Link>
            <Link href="/terms" className="hidden text-ink-2 hover:text-ink sm:inline">
              Terms
            </Link>
            <Link href="/login" className="rounded-lg bg-brand px-3.5 py-2 font-medium text-on-brand hover:opacity-90">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-deep">Thabaal (தபால்) · A message with momentum</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
            WhatsApp customer messaging, campaigns and orders for growing businesses
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2 sm:text-lg">
            Thabaal is a web portal that helps a business talk to its customers on WhatsApp: send campaigns, answer chats and calls, take orders, request payments and see
            reports. It works through Meta&apos;s official WhatsApp Business Platform, using each business&apos;s own WhatsApp number.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand hover:opacity-90">
              Sign in to Thabaal
            </Link>
            <a href="#google-data" className="rounded-lg border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand">
              How we use Google sign-in
            </a>
          </div>
          <p className="mt-3 text-sm text-muted">Thabaal is for businesses we work with. Accounts are set up by Thabaal for each business and its team.</p>
        </section>

        <section aria-labelledby="what" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h2 id="what" className="text-xl font-semibold text-ink sm:text-2xl">
            What Thabaal does
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(([t, d]) => (
              <Card key={t} title={t}>
                {d}
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h2 id="how" className="text-xl font-semibold text-ink sm:text-2xl">
            How it works
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-card border border-line bg-panel p-5">
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep">{i + 1}</span>
                <h3 className="mt-3 text-base font-semibold text-ink">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="google-data" aria-labelledby="google" className="mx-auto max-w-5xl scroll-mt-6 px-4 py-8 sm:px-6">
          <div className="rounded-card border border-line bg-panel p-5 sm:p-7">
            <h2 id="google" className="text-xl font-semibold text-ink sm:text-2xl">
              Why Thabaal asks for your Google account details
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
              Team members can sign in to Thabaal with <strong className="font-semibold text-ink">&ldquo;Continue with Google&rdquo;</strong> instead of a password. When you
              choose it, Google shares only your <strong className="font-semibold text-ink">name, email address and profile picture</strong> (the basic &ldquo;openid, email,
              profile&rdquo; permissions) with Thabaal. We use them only to:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
              <li>find the Thabaal account that matches your email address and sign you in securely;</li>
              <li>fill in your name on your Thabaal profile if it is blank, so your team knows who is signed in.</li>
            </ul>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
              Google sign-in does not create new accounts: it only works for an email a business has already added to Thabaal. We don&apos;t store your profile picture.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
              Thabaal does not read your Gmail, Google Drive, Contacts or Calendar, does not post anything for you, and does not sell your data or use it for advertising.
              You can remove Thabaal&apos;s access at any time from your Google Account&apos;s security settings. Full details are in our{" "}
              <Link href="/privacy" className={linkCls}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="trust" className="mx-auto max-w-5xl px-4 pb-14 pt-8 sm:px-6">
          <h2 id="trust" className="text-xl font-semibold text-ink sm:text-2xl">
            Your data, handled with care
          </h2>
          <p className="mt-3 max-w-3xl text-[0.9375rem] leading-relaxed text-ink-2">
            Each business&apos;s customer lists, messages and orders belong to that business and are used only to provide Thabaal to it. Data is encrypted in transit,
            access is limited by role, and a business can ask us to export or delete its data at any time. Read the{" "}
            <Link href="/privacy" className={linkCls}>
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className={linkCls}>
              Terms of Service
            </Link>
            , or see{" "}
            <Link href="/privacy#delete-your-data" className={linkCls}>
              how to delete your data
            </Link>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Thabaal · A message with momentum</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          </span>
        </div>
        <p className="mx-auto max-w-5xl px-4 pb-4 text-xs text-muted sm:px-6">
          WhatsApp and Meta are trademarks of Meta Platforms, Inc. Google is a trademark of Google LLC. Thabaal is not affiliated with or endorsed by Meta or Google.
        </p>
      </footer>
    </div>
  );
}
