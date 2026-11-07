import { Building2 } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { Callout } from "@/components/ui";
import { ThemeChoice } from "@/components/theme-toggle";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { numberHealth } from "@/lib/limits";
import { fmtDate } from "@/lib/format";
import { getScope, requireUser } from "@/lib/session";
import { OrderStepsForm } from "./order-steps-form";
import { DeliveryChargeForm } from "./delivery-charge-form";
import { readPaySettings } from "@/lib/pay-settings";
import { PaymentSetupForm } from "./payment-setup-form";
import { readFields } from "@/lib/custom-fields";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { flowShips, readFlow, type OrderFlowKey } from "@/lib/order-flow";
import { FLOW_TEMPLATE_NAMES, orderTemplateNames } from "@/lib/order-templates";
import { OrderTemplatesCard } from "./order-templates-card";
import { spendSummary } from "@/lib/spend";
import { effectivePlan, planUsage } from "@/lib/subscription";
import { StaffLogins } from "./staff-logins";
import { MetaLimitPicker } from "./meta-limit-picker";
import { inr } from "../portal-format";
import { LangChoice, PortalPage, T } from "../portal-ui";

/** The order update templates the shop's order steps need, each with its best status (any plain or picture version). */
async function orderTemplateRows(clientId: string, flow: OrderFlowKey) {
  const bases = FLOW_TEMPLATE_NAMES[flow];
  const have = await db.template.findMany({ where: { clientId, name: { in: bases.flatMap(orderTemplateNames) } }, select: { name: true, status: true } });
  const best = ["APPROVED", "PENDING", "PAUSED", "DRAFT", "REJECTED", "DISABLED"];
  return bases.map((name) => ({
    name,
    status: have.filter((t) => orderTemplateNames(name).includes(t.name)).map((t) => t.status as string).sort((a, b) => best.indexOf(a) - best.indexOf(b))[0] ?? null,
  }));
}

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

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
    // Everything the page needs is read in one round (staff logins and order templates used to wait their turn).
    const [[numbers, customers, products, ordersCount, client, spend, ownPayTemplate, payTemplate], [teamLogins, teamUsage, teamPlan], tmplRows] = await Promise.all([
      cid
      ? Promise.all([
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
      : ([[], 0, null, 0, null, null, null, null] as const),
      // Staff logins: who can sign in, and the plan's staff limit (none for a business without a plan on record).
      cid
        ? Promise.all([
            db.user.findMany({ where: { clientId: cid }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, access: true } }),
            planUsage(cid),
            effectivePlan(cid),
          ])
        : ([[], null, null] as const),
      // The order update templates the shop's order steps need (its order steps are read alongside).
      cid
        ? db.client.findUnique({ where: { id: cid }, select: { orderFlow: true } }).then((c) => orderTemplateRows(cid, readFlow(c?.orderFlow)))
        : [],
    ]);
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
                    <T ta="Google Sheet ஒத்திசைவு, வாடிக்கையாளர் மற்றும் ஆர்டர்களின் கூடுதல் விவரங்கள்.">
                      Google Sheet sync, and extra details on customers and orders.
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

        {cid && client && (
          <ScrollReveal>
            <OrderStepsForm current={readFlow(client.orderFlow)} canChange={scope.manager} />
          </ScrollReveal>
        )}

        {cid && client && (
          <ScrollReveal>
            <OrderTemplatesCard rows={tmplRows} canChange={scope.manager} />
          </ScrollReveal>
        )}

        {cid && client && (
          <ScrollReveal>
            <DeliveryChargeForm current={readPaySettings(client.paySettings, client.paymentConfig).deliveryFee} canChange={scope.manager} ships={flowShips(readFlow(client.orderFlow))} />
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
              {numbers.length > 0 && cid && (
                <MetaLimitPicker clientId={cid} current={numbers[0].messagingTier} canEdit={Boolean(scope.canManage)} />
              )}
            </section>
          </ScrollReveal>
        )}

        {cid && teamUsage && (
          <ScrollReveal>
            <StaffLogins
              logins={teamLogins.map((u, i) => ({ id: u.id, name: u.name, email: u.email, access: u.access, owner: i === 0, you: u.id === user.id }))}
              used={teamUsage.staff}
              limit={teamPlan?.status === "none" ? null : (teamPlan?.plan?.lim.staff ?? 0)}
              planName={teamPlan?.plan?.n ?? null}
              canChange={scope.manager && !scope.viewOnly}
            />
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

  // An admin looking at one client can set that client's order steps here too.
  const adminScope = await getScope();
  const pickedFlow = adminScope.clientId ? (await db.client.findUnique({ where: { id: adminScope.clientId }, select: { orderFlow: true } }))?.orderFlow : undefined;
  return frame(
    <>
      <ScrollReveal>
        <Callout tone="info" title="Sending, scheduler and the portal's look are in the admin panel">
          WhatsApp provider, the default Meta number, the scheduler and the portal&apos;s default look moved to{" "}
          <Link href="/admin/settings/sending" className="font-medium underline">Admin › Settings › Sending and look</Link>.
        </Callout>
      </ScrollReveal>
      <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        {langCard}
        {lookCard}
      </div>
      {adminScope.clientId && pickedFlow !== undefined && (
        <ScrollReveal className="mt-4 sm:mt-6">
          <OrderStepsForm current={readFlow(pickedFlow)} canChange />
        </ScrollReveal>
      )}
    </>,
    <Link className="btn" href="/admin/clients">
      <Building2 aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> Clients
    </Link>,
  );
}
