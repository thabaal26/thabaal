import { Building2, CheckCircle2, Circle } from "@/components/icons";
import { Clock3D, Send3D, Sparkles3D } from "@/components/icons-3d";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "@/components/intent-link";
import { Badge, Callout, Card, CardHeader } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { ThemeChoice } from "@/components/theme-toggle";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { numberHealth } from "@/lib/limits";
import { fmtDate } from "@/lib/format";
import { keyId } from "@/lib/secret-box";
import { getScope, requireUser } from "@/lib/session";
import { cn } from "@/lib/cn";
import { getSettings, wahaConfig } from "@/lib/provider";
import { waConfig } from "@/lib/whatsapp";
import { LocalSessionPanel, ProviderSwitch } from "./provider-panel";
import { OrderStepsForm } from "./order-steps-form";
import { PaymentSetupForm } from "./payment-setup-form";
import { DefaultImage } from "./default-image";
import { readFields } from "@/lib/custom-fields";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { readFlow } from "@/lib/order-flow";
import { AppearanceEditor } from "../appearance-editor";
import { portalDefault } from "@/lib/appearance";
import { spendSummary } from "@/lib/spend";
import { inr } from "../portal-format";
import { LangChoice, PortalPage, T } from "../portal-ui";

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
  const lookCard = (
    <section className="card">
      <div className="hd">
        <div>
          <h2><T ta="தோற்றம்">Look</T></h2>
          <p><T ta="வெளிச்சம், இருள் அல்லது உங்கள் சாதனத்தின்படி. இந்த சாதனத்தில் நினைவில் வைக்கப்படும்.">Light, dark, or follow your device. Remembered on this device.</T></p>
        </div>
        <ThemeChoice />
      </div>
    </section>
  );
  const langCard = (
    <section className="card">
      <div className="hd">
        <div>
          <h2><T ta="மொழி">Language</T></h2>
          <p><T ta="போர்ட்டலில் உள்ள அனைத்து சொற்களையும் மாற்றுகிறது. ஒவ்வொரு பக்கத்தின் மேலேயும் உள்ள பொத்தானிலும் மாற்றலாம்.">Changes the labels across the portal. Also on the button at the top of every page.</T></p>
        </div>
        <LangChoice />
      </div>
      <p className="muted small"><T ta="எளிய தமிழில் காட்டப்படும். எண்கள், தொகை மற்றும் பொத்தான்கள் இரு மொழிகளிலும் ஒரே மாதிரியாக இருக்கும்.">Helper text stays in simple words. Numbers, money and buttons look the same in both languages.</T></p>
    </section>
  );
  const frame = (children: React.ReactNode, actions?: React.ReactNode) => (
    <PortalPage title="Settings" titleTa="அமைப்புகள்" sub="WhatsApp numbers, payment details, language and look." subTa="வாட்ஸ்அப் எண்கள், பண விவரங்கள், மொழி மற்றும் தோற்றம்." actions={actions}>
      {children}
    </PortalPage>
  );

  if (user.role !== "ADMIN") {
    const cid = user.clientId;
    const scope = await getScope();
    const [numbers, customers, products, ordersCount, client, spend, ownPayTemplate, payTemplate] = cid
      ? await Promise.all([
          numberHealth(cid).catch(() => []),
          db.customer.count({ where: { clientId: cid, optedOut: false } }),
          getCatalogWithProducts(cid)
            .then((c) => c?.products.length ?? null)
            .catch(() => null),
          db.order.count({ where: { clientId: cid } }),
          db.client.findUnique({ where: { id: cid }, select: { name: true, website: true, supportPhone: true, paymentConfig: true, paySettings: true, billingMode: true, orderFlow: true, sheetCustomersUrl: true, sheetOrdersUrl: true, sheetSyncedAt: true, sheetHookUrl: true, customFields: true, defaultImageUrl: true, bannerUrl: true } }),
          spendSummary(cid).catch(() => null),
          db.template.findFirst({ where: { clientId: cid, name: PAYMENT_TEMPLATE }, select: { status: true } }),
          paymentTemplateFor(cid),
        ])
      : [[], 0, null, 0, null, null, null, null];
    const quality = (r: string | null | undefined) => (
      r === "GREEN" ? { tone: "ok", label: "High quality", labelTa: "உயர்ந்த தரம்" }
      : r === "YELLOW" ? { tone: "warn", label: "Medium quality", labelTa: "நடுத்தர தரம்" }
      : r === "RED" ? { tone: "bad", label: "Low quality", labelTa: "குறைந்த தரம்" }
      : { tone: "mute", label: "Not rated yet", labelTa: "இன்னும் மதிப்பிடப்படவில்லை" }
    );
    return frame(
      <div className="stack">
        {cid && client && (
          <ScrollReveal>
            <PaymentSetupForm
              config={client.paymentConfig}
              canChange={scope.manager}
              template={{ using: payTemplate?.name ?? null, ownName: PAYMENT_TEMPLATE, ownStatus: ownPayTemplate?.status ?? null }}
            />
          </ScrollReveal>
        )}

        {cid && client && (
          <ScrollReveal id="data" style={{ scrollMarginTop: 80 }}>
            <section className="card">
              <div className="hd">
                <div>
                  <h2><T ta="தரவு மற்றும் இணைப்புகள்">Data and connections</T></h2>
                  <p>
                    <T ta="Google Sheet ஒத்திசைவு, வாடிக்கையாளர் மற்றும் ஆர்டர்களின் கூடுதல் விவரங்கள், டெம்ப்ளேட்களின் இயல்புப் படம்.">
                      Google Sheet sync, extra details on customers and orders, and the default picture for templates.
                    </T>
                  </p>
                </div>
              </div>
              <div className="list">
                <div className="row">
                  <div className="grow">
                    <div className="t"><T ta="Google Sheet ஒத்திசைவு">Google Sheet sync</T></div>
                    <div className="muted small">
                      {client.sheetCustomersUrl || client.sheetOrdersUrl
                        ? `Connected${client.sheetSyncedAt ? ` · last read ${fmtDate(client.sheetSyncedAt, "d MMM, h:mm a")}` : ""}${client.sheetHookUrl ? " · live log on" : ""}`
                        : client.sheetHookUrl
                          ? "Live log on · no sheet to read yet"
                          : "Not connected"}
                    </div>
                  </div>
                  <Link className="btn sm" href="/dashboard/settings/sheet">
                    <T ta="திற">Open</T>
                  </Link>
                </div>
                {scope.manager && (
                  <div className="row">
                    <div className="grow">
                      <div className="t"><T ta="கூடுதல் விவரங்கள் (Custom fields)">Custom fields</T></div>
                      <div className="muted small">
                        {(() => {
                          const n = readFields(client.customFields).length;
                          return n ? `${n} field${n === 1 ? "" : "s"} on customers and orders` : "None yet: add details like GST number or order type";
                        })()}
                      </div>
                    </div>
                    <Link className="btn sm" href="/dashboard/settings/fields">
                      <T ta="திற">Open</T>
                    </Link>
                  </div>
                )}
              </div>
            </section>
          </ScrollReveal>
        )}

        {cid && client && scope.manager && (
          <ScrollReveal id="default-picture" style={{ scrollMarginTop: 80 }}>
            <DefaultImage url={client.defaultImageUrl} fallback={client.bannerUrl} />
          </ScrollReveal>
        )}

        {cid && client && (
          <ScrollReveal>
            <OrderStepsForm current={readFlow(client.orderFlow)} canChange={scope.manager} />
          </ScrollReveal>
        )}

        {cid && spend && (
          <ScrollReveal>
            <section className="card">
              <div className="hd">
                <div>
                  <h2><T ta="WhatsApp கட்டண விவரங்கள்">WhatsApp billing</T></h2>
                  <p><T ta="செய்திகளுக்கு Meta வசூலிப்பது. நாள் வாரியான விவரம் அறிக்கைகளில் உள்ளது.">What Meta charges for your messages. The day-by-day breakdown is in Reports.</T></p>
                </div>
                <Link className="btn" href="/dashboard/report">
                  <T ta="அறிக்கைகளில் செலவுகள்">See costs in Reports</T>
                </Link>
              </div>
              <div className="grid g3">
                <div className="stat">
                  <div className="l">
                    <T ta={spend.metaAccount.liveBalance > 0 || spend.prepaidFunds > 0 ? "மீதமுள்ள இருப்பு" : "இருப்பு"}>
                      {spend.metaAccount.liveBalance > 0 || spend.prepaidFunds > 0 ? "Balance left" : "Balance"}
                    </T>
                  </div>
                  {spend.metaAccount.liveBalance > 0 || spend.prepaidFunds > 0 ? (
                    <div className="v">{inr(spend.remainingBalance)}</div>
                  ) : (
                    <>
                      <div className="v" style={{ fontSize: 18 }}><T ta="Meta-வில்">On Meta</T></div>
                      <div className="d muted"><T ta="Meta நேரடியாக வசூலிக்கிறது">Meta bills you directly</T></div>
                    </>
                  )}
                </div>
                <div className="stat">
                  <div className="l"><T ta="இந்த மாதம்">This month</T></div>
                  <div className="v">{inr(spend.totalMonthSpentWithGst)}</div>
                  <div className="d muted">
                    <T ta={spend.liveSyncedFromMeta ? "GST உடன்" : "GST உடன் (மதிப்பீடு)"}>
                      with GST{spend.liveSyncedFromMeta ? "" : " (estimate)"}
                    </T>
                  </div>
                </div>
                <div className="stat">
                  <div className="l"><T ta="மீதமுள்ள இலவச பதில்கள்">Free replies left</T></div>
                  <div className="v">{spend.serviceQuota.freeRemaining.toLocaleString("en-IN")}</div>
                  <div className="d muted">
                    <T ta={`${spend.serviceQuota.totalFreeLimit.toLocaleString("en-IN")}-ல்`}>
                      of {spend.serviceQuota.totalFreeLimit.toLocaleString("en-IN")}
                    </T>
                  </div>
                </div>
              </div>
              {spend.metaAccount.billingUrl && (
                <div className="tools" style={{ marginTop: 14 }}>
                  {scope.manager && (
                    <a className="btn primary sm" href={spend.metaAccount.billingUrl} target="_blank" rel="noopener noreferrer">
                      <T ta="Meta-வில் ரீசார்ஜ் செய்">Recharge on Meta</T>
                    </a>
                  )}
                  <a className="btn sm" href={spend.metaAccount.billingUrl} target="_blank" rel="noopener noreferrer">
                    <T ta="Meta விலைப்பட்டியல்களைப் பதிவிறக்கு">Download Meta invoices</T>
                  </a>
                  <a className="btn sm ghost" href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer">
                    <T ta="Meta-வில் பட்டியல்">Catalogue on Meta</T>
                  </a>
                </div>
              )}
            </section>
          </ScrollReveal>
        )}

        <StaggerGroup className="grid g2" style={{ alignItems: "start" }}>
          <StaggerItem>{langCard}</StaggerItem>
          <StaggerItem>{lookCard}</StaggerItem>
        </StaggerGroup>


        {cid && (
          <ScrollReveal>
            <section className="card">
              <div className="hd">
                <div>
                  <h2><T ta="WhatsApp எண்கள்">WhatsApp numbers</T></h2>
                  <p><T ta="தரம் மதிப்பீடு உங்கள் செய்திகளைப் பற்றி வாடிக்கையாளர்கள் எவ்வாறு உணர்கிறார்கள் என்பதைக் காட்டுகிறது.">Quality rating shows how customers feel about your messages.</T></p>
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
                          {n.isDefault && (
                            <span className="muted small">
                              {" "}· <T ta="முதன்மை எண்">main number</T>
                            </span>
                          )}
                        </div>
                        <div className="muted small">
                          {n.displayPhone ?? <T ta="எண் இன்னும் காட்டப்படவில்லை">Number not shown yet</T>}
                          {n.limit != null ? (
                            <>
                              {" "}· <T ta={`ஒரு நாளைக்கு ${n.limit.toLocaleString("en-IN")} வாடிக்கையாளர்கள் வரை`}>{`up to ${n.limit.toLocaleString("en-IN")} customers a day`}</T>
                            </>
                          ) : ""}
                        </div>
                      </div>
                      <span className={`pill ${qy.tone}`}><T ta={qy.labelTa}>{qy.label}</T></span>
                    </div>
                  );
                })}
                {numbers.length === 0 && (
                  <p className="muted small">
                    <T ta="இன்னும் WhatsApp எண் இணைக்கப்படவில்லை. உங்கள் தபால் நிர்வாகி இதைச் சேர்ப்பார்.">No WhatsApp number connected yet. Your Thabaal admin adds it.</T>
                  </p>
                )}
              </div>
            </section>
          </ScrollReveal>
        )}

        {cid && (
          <ScrollReveal>
            <section className="card">
              <div className="hd">
                <div>
                  <h2><T ta="வணிக விவரங்கள்">Business details</T></h2>
                  <p>{client?.name}</p>
                </div>
              </div>
              <div className="grid g3" style={{ marginBottom: 12 }}>
                {[
                  { label: "Customers", labelTa: "வாடிக்கையாளர்கள்", v: customers },
                  { label: "Orders", labelTa: "ஆர்டர்கள்", v: ordersCount },
                  { label: "Products", labelTa: "பொருட்கள்", v: products },
                ].map(({ label, labelTa, v }) => (
                  <div key={label} className="stat">
                    <div className="l"><T ta={labelTa}>{label}</T></div>
                    <div className="v">{v == null ? "—" : Number(v).toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
              <div className="list">
                <div className="row">
                  <div className="grow muted"><T ta="இணையதளம்">Website</T></div>
                  <span>{client?.website || "—"}</span>
                </div>
                <div className="row">
                  <div className="grow muted"><T ta="தொலைபேசி எண்">Phone</T></div>
                  <span>{client?.supportPhone || "—"}</span>
                </div>
              </div>
            </section>
          </ScrollReveal>
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
      <StaggerGroup className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <StaggerItem>
          <LocalSessionPanel
            url={settings.wahaUrl ?? ""}
            hasKey={!!settings.wahaApiKey}
            session={settings.wahaSession}
            active={settings.provider === "LOCAL"}
          />
        </StaggerItem>
        <StaggerItem>
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
        </StaggerItem>

        <StaggerItem className="space-y-4 sm:space-y-6 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
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
          </div>
        </StaggerItem>
      </StaggerGroup>
      {adminScope.clientId && pickedFlow !== undefined && (
        <ScrollReveal className="mt-4 sm:mt-6">
          <OrderStepsForm current={readFlow(pickedFlow)} canChange />
        </ScrollReveal>
      )}
      <ScrollReveal>
        <Card id="appearance" className="card-3d mt-4 scroll-mt-20 sm:mt-6">
          <CardHeader
            tone="violet"
            icon={<Sparkles3D />}
            title="Appearance"
            description="The portal's default look: icons, tiles, cards, buttons and charts. Each client can have its own look on the Clients page."
            action={<Link href="/admin/clients" className={buttonClass("secondary", "sm")}>Per client</Link>}
          />
          <div className="p-3.5 sm:p-5">
            <AppearanceEditor mode="portal" initial={portalDefault(settings.appearance)} />
          </div>
        </Card>
      </ScrollReveal>
    </>,
    <Link className="btn" href="/admin/clients">
      <Building2 aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> Clients
    </Link>,
  );
}
