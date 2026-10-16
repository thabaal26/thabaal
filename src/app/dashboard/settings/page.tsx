import { Building2, CheckCircle2, Circle, LogOut } from "@/components/icons";
import { Clock3D, Send3D, Sparkles3D } from "@/components/icons-3d";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "@/components/intent-link";
import { Badge, buttonClass, Callout, Card, CardHeader } from "@/components/ui";
import { ThemeChoice } from "@/components/theme-toggle";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { numberHealth } from "@/lib/limits";
import { fmtDate } from "@/lib/format";
import { keyId } from "@/lib/secret-box";
import { getScope, requireUser } from "@/lib/session";
import { logout } from "../../login/actions";
import { cn } from "@/lib/cn";
import { getSettings, wahaConfig } from "@/lib/provider";
import { waConfig } from "@/lib/whatsapp";
import { LocalSessionPanel, ProviderSwitch } from "./provider-panel";
import { PasswordForm } from "./password-form";
import { OrderStepsForm } from "./order-steps-form";
import { readFlow } from "@/lib/order-flow";
import { AppearanceEditor } from "../appearance-editor";
import { portalDefault } from "@/lib/appearance";
import { spendSummary } from "@/lib/spend";
import { inr } from "../portal-format";
import { LangChoice, PortalPage } from "../portal-ui";

/** Within the last two days (module scope keeps the clock read out of render). */
const seenRecently = (d: Date | null) => Boolean(d && Date.now() - d.getTime() < 2 * 86_400_000);

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      {ok ? <CheckCircle2 aria-label="Set" className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle aria-label="Not set" className="mt-0.5 size-4 shrink-0 text-line-strong" />}
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", ok ? "text-ink" : "text-ink-2")}>{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </li>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-2">{label}</p>
      <code className="block select-all break-all rounded-control bg-sunken px-3 py-2 font-mono text-xs leading-relaxed text-ink">{value}</code>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const accountCard = (
    <section className="card">
      <div className="hd">
        <div>
          <h2>Your account</h2>
          <p>Signed in as {user.email}</p>
        </div>
        <form action={logout}>
          <button className="btn sm">
            <LogOut aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Sign out
          </button>
        </form>
      </div>
      <PasswordForm />
    </section>
  );
  const lookCard = (
    <section className="card">
      <div className="hd">
        <div>
          <h2>Look</h2>
          <p>Light, dark, or follow your device. Remembered on this device.</p>
        </div>
        <ThemeChoice />
      </div>
    </section>
  );
  const langCard = (
    <section className="card">
      <div className="hd">
        <div>
          <h2>Language</h2>
          <p>Changes the labels across the portal. Also on the button at the top of every page.</p>
        </div>
        <LangChoice />
      </div>
      <p className="muted small">Helper text stays in simple words. Numbers, money and buttons look the same in both languages.</p>
    </section>
  );
  const frame = (children: React.ReactNode, actions?: React.ReactNode) => (
    <PortalPage title="Settings" titleTa="அமைப்புகள்" sub="WhatsApp numbers, payment details, language and your account." subTa="வாட்ஸ்அப் எண்கள், பண விவரங்கள், மொழி மற்றும் உங்கள் கணக்கு." actions={actions}>
      {children}
    </PortalPage>
  );

  if (user.role !== "ADMIN") {
    const cid = user.clientId;
    const scope = await getScope();
    const [numbers, customers, products, ordersCount, client, spend] = cid
      ? await Promise.all([
          numberHealth(cid).catch(() => []),
          db.customer.count({ where: { clientId: cid, optedOut: false } }),
          getCatalogWithProducts(cid)
            .then((c) => c?.products.length ?? null)
            .catch(() => null),
          db.order.count({ where: { clientId: cid } }),
          db.client.findUnique({ where: { id: cid }, select: { name: true, website: true, supportPhone: true, paymentConfig: true, billingMode: true, orderFlow: true } }),
          spendSummary(cid).catch(() => null),
        ])
      : [[], 0, null, 0, null, null];
    const quality = (r: string | null | undefined) => (r === "GREEN" ? { tone: "ok", label: "High quality" } : r === "YELLOW" ? { tone: "warn", label: "Medium quality" } : r === "RED" ? { tone: "bad", label: "Low quality" } : { tone: "mute", label: "Not rated yet" });
    return frame(
      <div className="stack">
        {cid && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>How customers pay</h2>
                <p>WhatsApp payments, UPI and cash on delivery.</p>
              </div>
              <Link className="btn sm" href="/dashboard/revenue?tab=set">
                Open payment settings
              </Link>
            </div>
            <div className="list">
              <div className="row">
                <div className="grow t">Pay inside WhatsApp</div>
                <span className={`pill ${client?.paymentConfig ? "ok" : "mute"}`}>{client?.paymentConfig ? "On" : "Off"}</span>
              </div>
              <div className="row">
                <div className="grow t">UPI or bank (marked paid by you)</div>
                <span className="pill ok">On</span>
              </div>
              <div className="row">
                <div className="grow t">Cash on delivery</div>
                <span className="muted small">Chosen per order</span>
              </div>
            </div>
          </section>
        )}

        {cid && client && <OrderStepsForm current={readFlow(client.orderFlow)} canChange={scope.canManage} />}

        {cid && spend && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>WhatsApp billing</h2>
                <p>What Meta charges you for messages.</p>
              </div>
              <Link className="btn sm" href="/dashboard/revenue?tab=costs">
                See costs
              </Link>
            </div>
            <div className="grid g3">
              <div className="stat">
                <div className="l">{spend.metaAccount.liveBalance > 0 || spend.prepaidFunds > 0 ? "Balance left" : "Balance"}</div>
                <div className="v">{spend.metaAccount.liveBalance > 0 || spend.prepaidFunds > 0 ? inr(spend.remainingBalance) : "—"}</div>
              </div>
              <div className="stat">
                <div className="l">This month</div>
                <div className="v">{inr(spend.totalMonthSpentWithGst)}</div>
                <div className="d muted">with GST{spend.liveSyncedFromMeta ? "" : " (estimate)"}</div>
              </div>
              <div className="stat">
                <div className="l">Free replies left</div>
                <div className="v">{spend.serviceQuota.freeRemaining.toLocaleString("en-IN")}</div>
                <div className="d muted">of {spend.serviceQuota.totalFreeLimit.toLocaleString("en-IN")}</div>
              </div>
            </div>
            {spend.metaAccount.billingUrl && scope.canManage && (
              <div className="tools" style={{ marginTop: 12 }}>
                <a className="btn primary sm" href={spend.metaAccount.billingUrl} target="_blank" rel="noopener noreferrer">
                  Recharge on Meta
                </a>
              </div>
            )}
          </section>
        )}

        <div className="grid g2" style={{ alignItems: "start" }}>
          {langCard}
          {lookCard}
        </div>

        {accountCard}

        {cid && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>WhatsApp numbers</h2>
                <p>Quality rating shows how customers feel about your messages.</p>
              </div>
            </div>
            <div className="list">
              {numbers.map((n) => {
                const qy = quality(n.qualityRating);
                return (
                  <div key={n.id} className="row">
                    <div className="grow">
                      <div className="t">
                        {n.verifiedName || n.label}
                        {n.isDefault && <span className="muted small"> · main number</span>}
                      </div>
                      <div className="muted small">
                        {n.displayPhone ?? "Number not shown yet"}
                        {n.limit != null ? ` · up to ${n.limit.toLocaleString("en-IN")} customers a day` : ""}
                      </div>
                    </div>
                    <span className={`pill ${qy.tone}`}>{qy.label}</span>
                  </div>
                );
              })}
              {numbers.length === 0 && <p className="muted small">No WhatsApp number connected yet. Your Thabaal admin adds it.</p>}
            </div>
          </section>
        )}

        {cid && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>Business details</h2>
                <p>{client?.name}</p>
              </div>
            </div>
            <div className="grid g3" style={{ marginBottom: 12 }}>
              {[
                ["Customers", customers],
                ["Orders", ordersCount],
                ["Products", products],
              ].map(([label, v]) => (
                <div key={label as string} className="stat">
                  <div className="l">{label}</div>
                  <div className="v">{v == null ? "—" : Number(v).toLocaleString("en-IN")}</div>
                </div>
              ))}
            </div>
            <div className="list">
              <div className="row">
                <div className="grow muted">Website</div>
                <span>{client?.website || "—"}</span>
              </div>
              <div className="row">
                <div className="grow muted">Phone</div>
                <span>{client?.supportPhone || "—"}</span>
              </div>
            </div>
          </section>
        )}
      </div>,
    );
  }

  const cfg = waConfig();
  const settings = await getSettings();
  // An admin looking at one client can set that client's order steps here too.
  const adminScope = await getScope();
  const pickedFlow = adminScope.clientId ? (await db.client.findUnique({ where: { id: adminScope.clientId }, select: { orderFlow: true } }))?.orderFlow : undefined;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return frame(
    <>
      <ProviderSwitch provider={settings.provider} metaLive={cfg.live} localReady={!!wahaConfig(settings)} />
      <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <LocalSessionPanel
          url={settings.wahaUrl ?? ""}
          hasKey={!!settings.wahaApiKey}
          session={settings.wahaSession}
          active={settings.provider === "LOCAL"}
        />
        <Card className="card-3d">
          <CardHeader
            tone="brand"
            icon={<Send3D />}
            title="Meta Cloud API"
            description={`Default number, used by clients without their own WhatsApp details on the Clients page. ${cfg.live ? "Configured in Vercel → Environment Variables." : "Not configured: add these in Vercel → Environment Variables, then redeploy."}`}
            action={settings.provider === "META" ? <Badge tone="green" dot>Active</Badge> : undefined}
          />
          <ul className="divide-y divide-line">
            <Check ok={!!cfg.token} label="Access token" hint="WHATSAPP_TOKEN: a permanent System User token from Meta Business settings." />
            <Check ok={!!cfg.phoneNumberId} label="Phone number ID" hint="WHATSAPP_PHONE_NUMBER_ID from WhatsApp Manager → API setup." />
            <Check ok={!!cfg.wabaId} label="WhatsApp Business Account ID" hint="WHATSAPP_BUSINESS_ACCOUNT_ID, used to create and sync templates." />
            <Check ok={!!cfg.appId} label="Meta App ID" hint="META_APP_ID, needed only for image headers." />
            <Check ok={!!process.env.META_APP_SECRET} label="App secret" hint="META_APP_SECRET, used to verify that webhooks really come from Meta." />
            <Check ok={!!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN} label="Webhook verify token" hint="WHATSAPP_WEBHOOK_VERIFY_TOKEN: any secret string, entered in Meta too." />
          </ul>
          <div className="space-y-3 border-t border-line p-4 sm:p-5">
            <Copyable label="Webhook callback URL" value={`${origin}/api/webhook`} />
            <p className="text-xs text-muted leading-relaxed">
              Subscribe to Meta webhook fields:{" "}
              <code className="text-ink">
                messages, calls, message_template_status_update, message_template_quality_update, template_category_update, phone_number_quality_update, account_update, account_alerts
              </code>
            </p>
          </div>
        </Card>

        <div className="space-y-4 sm:space-y-6 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <Card className="card-3d">
            <CardHeader tone="info" icon={<Clock3D />} title="Scheduler" description="Something must call this URL every 5 minutes (every minute with the local session) to start campaigns and send batches." />
            <div className="space-y-3 p-4 sm:p-5">
              <Copyable label="Cron URL" value={`${origin}/api/cron`} />
              <Copyable label="Header" value="Authorization: Bearer •••CRON_SECRET•••" />
              {seenRecently(settings.cronKeyInUrlAt) && settings.cronKeyInUrlAt && (
                <Callout tone="warning" title="Your scheduler puts the password in the web address">
                  Last seen {fmtDate(settings.cronKeyInUrlAt, "d MMM, h:mm a")}. Web addresses are saved in logs. In cron-job.org, open the job → Advanced → Headers, add
                  <code> Authorization</code> = <code>Bearer</code> followed by your CRON_SECRET, and remove <code>?key=…</code> from the URL.
                </Callout>
              )}
              <p className="text-xs text-muted">
                {process.env.CRON_SECRET ? "CRON_SECRET is set." : "Set CRON_SECRET first."} Send it in the Authorization header, never in the URL. The included GitHub Action already does
                this. On Vercel Pro, add a cron to <code>vercel.json</code>; Vercel sends the header itself. The scheduler can also be run from the Dashboard page.
              </p>
              <p className="text-xs text-muted">
                {keyId() ? (
                  <>Stored access tokens are encrypted (key <code>{keyId()}</code>).</>
                ) : (
                  <b className="text-warning">DATA_ENC_KEY isn&apos;t set: access tokens are stored without encryption.</b>
                )}
              </p>
            </div>
          </Card>
          <div className="space-y-4 sm:space-y-6">
            {langCard}
            {lookCard}
            {accountCard}
          </div>
        </div>
      </div>
      {adminScope.clientId && pickedFlow !== undefined && (
        <div className="mt-4 sm:mt-6">
          <OrderStepsForm current={readFlow(pickedFlow)} canChange />
        </div>
      )}
      <Card id="appearance" className="card-3d mt-4 scroll-mt-20 sm:mt-6">
        <CardHeader
          tone="violet"
          icon={<Sparkles3D />}
          title="Appearance"
          description="The portal's default look: icons, tiles, cards, buttons and charts. Each client can have its own look on the Clients page."
          action={<Link href="/dashboard/clients" className={buttonClass("secondary", "sm")}>Per client</Link>}
        />
        <div className="p-3.5 sm:p-5">
          <AppearanceEditor mode="portal" initial={portalDefault(settings.appearance)} />
        </div>
      </Card>
    </>,
    <Link className="btn" href="/dashboard/clients">
      <Building2 aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Clients
    </Link>,
  );
}
