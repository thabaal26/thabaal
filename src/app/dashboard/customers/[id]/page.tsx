import { ArrowUpRight, Clock, IndianRupee, MapPin, MessageCircle, ShoppingBag } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { Messages3D, ShoppingBag3D } from "@/components/icons-3d";
import { OverflowMenu } from "@/components/overflow-menu";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { orderRef } from "@/lib/order-ref";
import { itemsText, money, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { replyWindowEnd } from "@/lib/replies";
import { marketingPaused } from "@/lib/held";
import { homeCityOf, regionsFor } from "@/lib/regions";
import { readFields, readValues, showValue } from "@/lib/custom-fields";
import { getScope, owned } from "@/lib/session";
import { sendableTemplates } from "@/lib/senders";
import { META_SAMPLES } from "@/lib/template";
import { sendCatalogue } from "../../actions/catalog";
import { requestCallPermission } from "../../actions/calls";
import { setOptOut } from "../../actions/customers";
import { DeleteCustomerButton, EditCustomerButton } from "../customer-tools";
import { T } from "../../portal-ui";
import { CallButton } from "./call-button";
import { PausedOffersNote } from "./paused-offers-note";
import { PurchaseJourney } from "./purchase-journey";
import { SendPanel } from "./send-panel";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";


export default async function CustomerPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const c = await db.customer.findFirst({
    where: { id, ...owned(scope) },
    include: {
      client: { select: { name: true, homeCity: true, customFields: true } },
      messages: { include: { run: { select: { campaign: { select: { name: true } } } }, sender: { select: { label: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      replies: { include: { sender: { select: { label: true } } }, orderBy: { receivedAt: "desc" }, take: 100 },
      orders: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!c) notFound();

  const [templates, numbers, paused] = await Promise.all([
    sendableTemplates(c.clientId).then((sendable) =>
      db.template.findMany({ where: { clientId: c.clientId, status: "APPROVED", name: { notIn: META_SAMPLES }, ...sendable }, orderBy: { name: "asc" } }),
    ),
    db.whatsAppNumber.findMany({ where: { clientId: c.clientId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, label: true, businessAccountId: true } }),
    marketingPaused([c.id]),
  ]);
  const pausedUntil = paused.get(c.id);
  // WhatsApp allows typed messages for 24 hours after the customer last wrote to us.
  const windowEnd = replyWindowEnd(c.replies[0]?.receivedAt);
  // WhatsApp only lets us ring customers who tapped "Allow" on our call request.
  const callAllowed = Boolean(c.callAllowedUntil && c.callAllowedUntil > new Date());

  const sent = c.messages.filter((m) => !["QUEUED", "SKIPPED"].includes(m.status));
  const delivered = sent.filter((m) => m.status === "DELIVERED" || m.status === "READ").length;
  const read = sent.filter((m) => m.status === "READ").length;

  const timeline: ConversationEntry[] = [
    ...c.messages.map((m) => ({
      at: m.sentAt ?? m.createdAt, type: "out" as const, id: m.id, template: m.templateName, campaign: m.run?.campaign.name ?? null,
      status: m.status, body: m.body, readAt: m.readAt, error: m.error, via: m.sender?.label ?? null,
    })),
    ...c.replies.map((r) => ({ at: r.receivedAt, type: "in" as const, id: r.id, text: r.text, kind: r.kind, mediaId: r.mediaId, mediaType: r.mediaType, via: r.sender?.label ?? null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // Every customer carries the client-wide tag (e.g. thenan-oils), so it says nothing here.
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const productTags = c.tags.filter((t) => plain(t) !== plain(c.client.name) && !t.trim().toLowerCase().startsWith("loyalty-bonus:"));

  const meta = [
    formatPhone(c.phone),
    c.location ? `${c.location}${c.region && c.region !== "Not sure" ? `, ${c.region}` : ""}` : null,
    !scope.clientId ? c.client.name : null,
    `customer since ${fmtDate(c.createdAt, "d MMM yyyy")}`,
    c.callAllowedUntil && c.callAllowedUntil > new Date() ? `calls allowed until ${fmtDate(c.callAllowedUntil, "d MMM")}` : null,
  ].filter(Boolean);
  const metaTa = [
    formatPhone(c.phone),
    c.location ? `${c.location}${c.region && c.region !== "Not sure" ? `, ${c.region}` : ""}` : null,
    !scope.clientId ? c.client.name : null,
    `${fmtDate(c.createdAt, "d MMM yyyy")} முதல் வாடிக்கையாளர்`,
    c.callAllowedUntil && c.callAllowedUntil > new Date() ? `${fmtDate(c.callAllowedUntil, "d MMM")} வரை அழைக்கலாம்` : null,
  ].filter(Boolean);

  // Secondary actions: inline on computers, in a "⋯" sheet on phones.
  const more = [
    scope.canOperate && windowEnd && !c.optedOut && (
      <ActionButton key="cat" action={sendCatalogue.bind(null, c.id)} size="md" title="Free while the customer's 24-hour window is open">
        <ShoppingBag aria-hidden className="size-4" /> <T ta="பட்டியலை அனுப்பு">Send catalogue</T>
      </ActionButton>
    ),
    scope.canOperate && !callAllowed && (
      <ActionButton
        key="ask"
        action={requestCallPermission.bind(null, c.id)}
        size="md"
        title={c.callAskedAt ? `Last asked ${fmtDate(c.callAskedAt, "d MMM, h:mm a")}` : "Sends WhatsApp's \"allow calls?\" prompt"}
      >
        {c.callAskedAt ? <T ta="மீண்டும் அழைக்க அனுமதி கேள்">Ask to call again</T> : <T ta="அழைக்க அனுமதி கேள்">Ask to call</T>}
      </ActionButton>
    ),
    scope.canManage && (
      <ActionButton key="opt" action={setOptOut.bind(null, c.id, !c.optedOut)} size="md">
        {c.optedOut ? <T ta="மீண்டும் செய்திகளை அனுமதி">Opt back in</T> : <T ta="செய்திகளை நிறுத்து">Opt out</T>}
      </ActionButton>
    ),
    scope.canManage && c.orders.length === 0 && <DeleteCustomerButton key="del" id={c.id} name={c.name} />,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={c.name}
        titleIsData
        back={{ href: "/dashboard/customers", label: "Customers" }}
        meta={<span className="tabular"><T ta={metaTa.join(" · ")}>{meta.join(" · ")}</T></span>}
        rowActions
        actions={
          <>
            <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
              <MessageCircle aria-hidden className="size-4" />
              <span>
                <span className="max-sm:sr-only"><T ta="செய்தி அனுப்பு · ">Message on </T></span>WhatsApp
              </span>
            </a>
            {scope.canOperate && <CallButton customerId={c.id} name={c.name} primary={callAllowed} />}
            <Link href={`/dashboard?cust=${c.id}&range=all`} className={buttonClass("secondary")}>
              <span>
                <span className="max-sm:sr-only"><T ta="அவர்களின் ">Their </T></span><T ta="விவரங்கள்">insights</T>
              </span>
            </Link>
            {more.length > 0 && (
              <OverflowMenu title={c.name} label={`More actions for ${c.name}`}>
                {more}
              </OverflowMenu>
            )}
          </>
        }
      />

      {(() => {
        // The design's profile figures: what they bought, from orders that stand.
        const bought = c.orders.filter((o) => o.status !== "CANCELLED" && (o.paidAt || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status)));
        const spent = bought.reduce((n, o) => n + o.total, 0);
        const last = bought.reduce<Date | null>((d, o) => (!d || o.createdAt > d ? o.createdAt : d), null);
        const unpaid = c.orders.filter((o) => !o.paidAt && (o.status === "NEW" || o.status === "CONFIRMED")).reduce((n, o) => n + o.total, 0);
        return (
          <>
            <div className="grid g4 keep2">
              <Stat
                label="Orders"
                value={fmtNumber(bought.length)}
                sub="Standing orders"
                icon={<ShoppingBag className="size-4" />}
                tone="brand"
              />
              <Stat
                label="Spend"
                value={money(spent)}
                sub="Total paid"
                icon={<IndianRupee className="size-4" />}
                tone="info"
              />
              <Stat
                label="Average order"
                value={bought.length ? money(spent / bought.length) : "—"}
                sub="Per order"
                icon={<ArrowUpRight className="size-4" />}
                tone="violet"
              />
              <Stat
                label="Last order"
                value={last ? fmtDate(last, "d MMM") : <T>Never</T>}
                sub={unpaid > 0 ? `Unpaid cart ${money(unpaid)}` : "All paid"}
                subTa={unpaid > 0 ? `நிலுவை கார்ட் ${money(unpaid)}` : undefined}
                icon={<Clock className="size-4" />}
                tone={unpaid > 0 ? "amber" : "gold"}
              />
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              <T
                ta={`${fmtNumber(sent.length)} பிரச்சாரச் செய்திகள் பெற்றார் · ${pct(read, delivered)}% படித்தார் · ${fmtNumber(c.replies.length)} பதில்கள்${c.replies[0] ? ` (கடைசியாக ${fmtDate(c.replies[0].receivedAt, "d MMM")})` : ""}${c.optedOut ? " · பிரச்சாரங்களை நிறுத்தியவர்" : ""}`}
              >
                {fmtNumber(sent.length)} campaign message{sent.length === 1 ? "" : "s"} received · {pct(read, delivered)}% read · {fmtNumber(c.replies.length)} repl{c.replies.length === 1 ? "y" : "ies"}
                {c.replies[0] ? ` (last ${fmtDate(c.replies[0].receivedAt, "d MMM")})` : ""}
                {c.optedOut ? " · opted out of campaigns" : ""}
              </T>
            </p>
          </>
        );
      })()}

      {/* Computers: the profile in a sticky side column beside the send panel and conversation. */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-2 lg:row-start-1">
          <SendPanel
            customer={{ id: c.id, name: c.name, phone: c.phone, location: c.location, purchases: c.purchases }}
            templates={templates}
            numbers={numbers}
            canSend={scope.canManage}
            windowEndsAt={windowEnd ? fmtDate(windowEnd, "d MMM, h:mm a") : null}
            blocked={c.optedOut ? "This customer opted out of messages. Opt them back in to send." : c.unreachable ? "WhatsApp says this number can't receive messages." : null}
          />

          <PurchaseJourney
            customer={{ id: c.id, name: c.name, phone: c.phone, tags: c.tags }}
            brandName={c.client.name}
            canManage={scope.canManage}
            orders={c.orders}
            replies={c.replies}
            readDates={c.messages.map((m) => m.readAt).filter((d): d is Date => d !== null)}
            sheetPurchases={c.purchases}
          />

          <Card className="card-3d overflow-hidden">
            <CardHeader tone="brand" icon={<Messages3D />} title="Conversation" description="Messages sent to this customer and what they wrote back. The newest is at the bottom." />
            {timeline.length ? (
              <Conversation entries={timeline} className="max-h-[36rem] min-h-48" />
            ) : (
              <EmptyState icon={<Messages3D />} title="No messages with this customer yet">
                Campaign messages and their replies will appear here.
              </EmptyState>
            )}
          </Card>
        </div>

        <Card className="card-3d lg:sticky lg:top-24 lg:col-start-1 lg:row-start-1">
          <CardHeader
            tone="violet"
            icon={<ShoppingBag3D />}
            title="What they buy"
            action={
              scope.canManage && (
                <EditCustomerButton
                  customer={{
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    tags: productTags.join(", "),
                    location: c.location ?? "",
                    locationRaw: c.locationRaw ?? "",
                    region: c.region ?? regionsFor(homeCityOf(c.client))[0],
                    purchases: c.purchases ?? "",
                    extra: readValues(c.extra),
                  }}
                  regions={regionsFor(homeCityOf(c.client))}
                  fields={readFields(c.client.customFields, "customer")}
                />
              )
            }
          />
          <div className="space-y-4 p-4 sm:p-5">
            {c.orders.length > 0 && (() => {
              const activeOrders = c.orders.filter((o) => o.status !== "CANCELLED");
              const replacedCarts = c.orders.filter((o) => o.status === "CANCELLED");
              const boughtItemSet = new Set(
                activeOrders.flatMap((o) => ((o.items as OrderItem[] | null) ?? []).map((i) => (i.name ?? i.id).toLowerCase())),
              );
              const consideredOnly = [
                ...new Set(
                  replacedCarts
                    .flatMap((o) => ((o.items as OrderItem[] | null) ?? []).map((i) => (i.name ?? i.id).trim()))
                    .filter((n) => n && !boughtItemSet.has(n.toLowerCase())),
                ),
              ];
              return (
                <div className="space-y-3">
                  {activeOrders.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
                        <span><T ta={`இப்போதைய & பழைய ஆர்டர்கள் (${activeOrders.length})`}>{`Current & past orders (${activeOrders.length})`}</T></span>
                        <span className="tabular"><T ta={`செலவு ${money(activeOrders.reduce((sum, o) => sum + o.total, 0))}`}>{`Spent ${money(activeOrders.reduce((sum, o) => sum + o.total, 0))}`}</T></span>
                      </p>
                      <ul className="divide-y divide-line rounded-control bg-sunken px-3 text-sm">
                        {activeOrders.map((o) => (
                          <li key={o.id} className="py-2">
                            <div className="flex justify-between gap-2 text-xs text-muted">
                              <span>
                                <strong className="font-mono text-ink-2">{orderRef(o)}</strong> · {fmtDate(o.createdAt, "d MMM yyyy")} · {o.status.toLowerCase()}
                              </span>
                              <span className="tabular font-semibold text-ink">{money(o.total, o.currency)}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2">{itemsText(o.items as OrderItem[])}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {replacedCarts.length > 0 && (
                    <div className="rounded-control border border-warning-border/60 bg-warning-bg/35 p-2.5 text-xs">
                      <p className="flex items-center justify-between font-semibold text-ink-2">
                        <span><T ta={`கார்ட் பழக்கம் · முந்தைய / மாற்றப்பட்ட கார்ட்கள் (${replacedCarts.length})`}>{`Cart mentality · Earlier / replaced carts (${replacedCarts.length})`}</T></span>
                      </p>
                      {consideredOnly.length > 0 && (
                        <p className="mt-1 text-ink-2">
                          <span className="font-semibold text-danger"><T ta="பார்த்து கைவிட்டவை: ">Considered &amp; dropped: </T></span>
                          {consideredOnly.join(", ")}
                        </p>
                      )}
                      <ul className="mt-1.5 divide-y divide-warning-border/40 text-muted">
                        {replacedCarts.slice(0, 4).map((o) => (
                          <li key={o.id} className="py-1.5">
                            <div className="flex justify-between gap-2">
                              <span>
                                <strong className="font-mono text-ink-2">{orderRef(o)}</strong> · {fmtDate(o.createdAt, "d MMM, h:mm a")}
                                {o.internalNote && /superseded by/i.test(o.internalNote) ? <T ta=" · மாற்றப்பட்டது"> · replaced</T> : <T ta=" · ரத்து"> · cancelled</T>}
                              </span>
                              <span className="tabular">{money(o.total, o.currency)}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-ink-2">{itemsText(o.items as OrderItem[])}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
            {c.purchases ? (
              <p className="flex gap-2 text-sm">
                <ShoppingBag aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                {c.purchases}
              </p>
            ) : (
              c.orders.length === 0 && <p className="text-sm text-muted"><T>No purchase recorded.</T></p>
            )}
            {c.location && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <div>
                  <Link href={`/dashboard/customers?area=${encodeURIComponent(`loc:${c.location}`)}`} className="inline-flex min-h-10 items-center hover:underline sm:min-h-0">
                    {c.location}
                  </Link>
                  <p className="text-xs text-muted">
                    {c.region}
                    {c.locationRaw && c.locationRaw !== c.location ? <T ta={` · "${c.locationRaw}" என எழுதப்பட்டது`}>{` · written as "${c.locationRaw}"`}</T> : ""}
                  </p>
                </div>
              </div>
            )}
            {(() => {
              const values = readValues(c.extra);
              const shown = readFields(c.client.customFields, "customer").filter((f) => values[f.key]);
              return shown.length ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {shown.map((f) => (
                    <div key={f.key} className="min-w-0">
                      <dt className="text-xs text-muted">{f.label}</dt>
                      <dd className="truncate text-ink">{showValue(f, values[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              ) : null;
            })()}
            {pausedUntil && <PausedOffersNote until={pausedUntil} />}
            <div className="rounded-control bg-sunken px-3 py-2 text-xs">
              <p className="font-medium text-ink-2"><T>Agreed to WhatsApp messages</T></p>
              {c.optInSource ? (
                <p className="mt-0.5 text-muted">
                  {c.optInSource}
                  {c.optInAt ? ` · ${fmtDate(c.optInAt, "d MMM yyyy")}` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-warning"><T>Not recorded. Meta requires consent before marketing messages.</T></p>
              )}
            </div>
            {(productTags.length > 0 || c.optedOut || c.unreachable) && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted"><T>Groups</T></p>
                <div className="flex flex-wrap gap-1">
                  {c.optedOut && <Badge tone="red">Opted out</Badge>}
                  {c.unreachable && <Badge tone="amber">Can&apos;t receive WhatsApp</Badge>}
                  {productTags.map((t) => (
                    <Link key={t} href={`/dashboard/customers?tag=${encodeURIComponent(t)}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full sm:min-h-0 sm:min-w-0 sm:py-1">
                      <Badge>{t === "no-item-info" ? "no item recorded" : t}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
