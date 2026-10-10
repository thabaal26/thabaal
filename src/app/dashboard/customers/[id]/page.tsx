import { CheckCheck, Eye, MapPin, MessageCircle, Send, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { OverflowMenu } from "@/components/overflow-menu";
import { Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { itemsText, money, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { replyWindowEnd } from "@/lib/replies";
import { marketingPaused } from "@/lib/held";
import { getScope, owned } from "@/lib/session";
import { sendableTemplates } from "@/lib/senders";
import { META_SAMPLES } from "@/lib/template";
import { sendCatalogue } from "../../actions/catalog";
import { requestCallPermission } from "../../actions/calls";
import { setOptOut } from "../../actions/customers";
import { CallButton } from "./call-button";
import { PausedOffersNote } from "./paused-offers-note";
import { SendPanel } from "./send-panel";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";


export default async function CustomerPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const c = await db.customer.findFirst({
    where: { id, ...owned(scope) },
    include: {
      client: { select: { name: true } },
      messages: { include: { run: { select: { campaign: { select: { name: true } } } }, sender: { select: { label: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      replies: { include: { sender: { select: { label: true } } }, orderBy: { receivedAt: "desc" }, take: 100 },
      orders: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!c) notFound();

  const [templates, numbers, paused] = await Promise.all([
    db.template.findMany({ where: { clientId: c.clientId, status: "APPROVED", name: { notIn: META_SAMPLES }, ...(await sendableTemplates(c.clientId)) }, orderBy: { name: "asc" } }),
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
  const productTags = c.tags.filter((t) => plain(t) !== plain(c.client.name));

  const meta = [
    formatPhone(c.phone),
    c.location ? `${c.location}${c.region && c.region !== "Not sure" ? `, ${c.region}` : ""}` : null,
    !scope.clientId ? c.client.name : null,
    `customer since ${fmtDate(c.createdAt, "d MMM yyyy")}`,
    c.callAllowedUntil && c.callAllowedUntil > new Date() ? `calls allowed until ${fmtDate(c.callAllowedUntil, "d MMM")}` : null,
  ].filter(Boolean);

  // Secondary actions: inline on computers, in a "⋯" sheet on phones.
  const more = [
    scope.canOperate && windowEnd && !c.optedOut && (
      <ActionButton key="cat" action={sendCatalogue.bind(null, c.id)} size="md" title="Free while the customer's 24-hour window is open">
        <ShoppingBag aria-hidden className="size-4" /> Send catalogue
      </ActionButton>
    ),
    scope.canOperate && !callAllowed && (
      <ActionButton
        key="ask"
        action={requestCallPermission.bind(null, c.id)}
        size="md"
        title={c.callAskedAt ? `Last asked ${fmtDate(c.callAskedAt, "d MMM, h:mm a")}` : "Sends WhatsApp's \"allow calls?\" prompt"}
      >
        {c.callAskedAt ? "Ask to call again" : "Ask to call"}
      </ActionButton>
    ),
    scope.canManage && (
      <ActionButton key="opt" action={setOptOut.bind(null, c.id, !c.optedOut)} size="md">
        {c.optedOut ? "Opt back in" : "Opt out"}
      </ActionButton>
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={c.name}
        back={{ href: "/dashboard/customers", label: "Customers" }}
        meta={<span className="tabular">{meta.join(" · ")}</span>}
        rowActions
        actions={
          <>
            <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
              <MessageCircle aria-hidden className="size-4" />
              <span>
                <span className="max-sm:sr-only">Message on </span>WhatsApp
              </span>
            </a>
            {scope.canOperate && <CallButton customerId={c.id} name={c.name} primary={callAllowed} />}
            {more.length > 0 && (
              <OverflowMenu title={c.name} label={`More actions for ${c.name}`}>
                {more}
              </OverflowMenu>
            )}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <Stat label="Messages received" value={fmtNumber(sent.length)} sub={c.optedOut ? "Opted out of campaigns" : "From your campaigns"} icon={<Send className="size-4" />} tone="brand" />
        <Stat label="Read" value={`${pct(read, delivered)}%`} sub={`${read} of ${delivered} delivered`} icon={<Eye className="size-4" />} tone="info" meter={pct(read, delivered)} />
        <Stat label="Replies" value={fmtNumber(c.replies.length)} sub={c.replies[0] ? `Last ${fmtDate(c.replies[0].receivedAt, "d MMM")}` : "None yet"} icon={<CheckCheck className="size-4" />} tone="violet" />
      </div>

      {/* Computers: the profile in a sticky side column beside the send panel and conversation. */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-2 lg:row-start-1">
          <SendPanel
            customer={{ id: c.id, name: c.name, phone: c.phone }}
            templates={templates}
            numbers={numbers}
            canSend={scope.canManage}
            windowEndsAt={windowEnd ? fmtDate(windowEnd, "d MMM, h:mm a") : null}
            blocked={c.optedOut ? "This customer opted out of messages. Opt them back in to send." : c.unreachable ? "WhatsApp says this number can't receive messages." : null}
          />

          <Card className="card-3d overflow-hidden">
            <CardHeader tone="brand" title="Conversation" description="Messages sent to this customer and what they wrote back. The newest is at the bottom." />
            {timeline.length ? (
              <Conversation entries={timeline} className="max-h-[36rem] min-h-48" />
            ) : (
              <EmptyState icon={<MessageCircle />} title="No messages with this customer yet">
                Campaign messages and their replies will appear here.
              </EmptyState>
            )}
          </Card>
        </div>

        <Card className="card-3d lg:sticky lg:top-24 lg:col-start-1 lg:row-start-1">
          <CardHeader tone="violet" title="What they buy" />
          <div className="space-y-4 p-4 sm:p-5">
            {c.orders.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
                  <span>Orders ({c.orders.length})</span>
                  <span className="tabular">Spent {money(c.orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.total, 0))}</span>
                </p>
                <ul className="divide-y divide-line rounded-control bg-sunken px-3 text-sm">
                  {c.orders.map((o) => (
                    <li key={o.id} className="py-2">
                      <div className="flex justify-between gap-2 text-xs text-muted">
                        <span>
                          {fmtDate(o.createdAt, "d MMM yyyy")} · {o.status.toLowerCase()}
                        </span>
                        <span className="tabular">{money(o.total, o.currency)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2">{itemsText(o.items as OrderItem[])}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.purchases ? (
              <p className="flex gap-2 text-sm">
                <ShoppingBag aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                {c.purchases}
              </p>
            ) : (
              c.orders.length === 0 && <p className="text-sm text-muted">No purchase recorded.</p>
            )}
            {c.location && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                <div>
                  <Link href={`/dashboard/customers?area=${encodeURIComponent(`loc:${c.location}`)}`} className="hover:underline">
                    {c.location}
                  </Link>
                  <p className="text-xs text-muted">
                    {c.region}
                    {c.locationRaw && c.locationRaw !== c.location ? ` · written as "${c.locationRaw}"` : ""}
                  </p>
                </div>
              </div>
            )}
            {pausedUntil && <PausedOffersNote until={pausedUntil} />}
            <div className="rounded-control bg-sunken px-3 py-2 text-xs">
              <p className="font-medium text-ink-2">Agreed to WhatsApp messages</p>
              {c.optInSource ? (
                <p className="mt-0.5 text-muted">
                  {c.optInSource}
                  {c.optInAt ? ` · ${fmtDate(c.optInAt, "d MMM yyyy")}` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-warning">Not recorded. Meta requires consent before marketing messages.</p>
              )}
            </div>
            {(productTags.length > 0 || c.optedOut || c.unreachable) && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Groups</p>
                <div className="flex flex-wrap gap-1">
                  {c.optedOut && <Badge tone="red">Opted out</Badge>}
                  {c.unreachable && <Badge tone="amber">Can&apos;t receive WhatsApp</Badge>}
                  {productTags.map((t) => (
                    <Link key={t} href={`/dashboard/customers?tag=${encodeURIComponent(t)}`} className="rounded-full py-1">
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
