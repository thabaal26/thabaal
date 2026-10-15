import { CreditCard, MessageCircle, Store } from "@/components/icons";
import { cssColor, type ChartColor } from "@/lib/chart-theme";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Inbox3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { DonutPanel, StatChip, type Slice } from "@/components/viz";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { inboxPriority, type InboxItem, type Lane } from "@/lib/inbox-priority";
import { getScope, ownedMessages } from "@/lib/session";
import { sendCatalogue } from "../../actions/catalog";
import { requestPayment } from "../../actions/orders";
import { setReplyHandled } from "../../actions/replies";
import { InboxTabs } from "../inbox-tabs";

export const metadata: Metadata = { title: "Priority inbox" };
export const dynamic = "force-dynamic";

const LANES: Record<Lane, { title: string; hint: string; color: ChartColor }> = {
  money: { title: "Money waiting", hint: "Unpaid cart: close the sale", color: "gold" },
  buying: { title: "Wants to buy", hint: "Asked for price, stock or to order", color: "emerald" },
  regular: { title: "Past buyers", hint: "Customers who've paid before", color: "blue" },
  other: { title: "Questions & new", hint: "Everything else", color: "violet" },
};
const ORDER: Lane[] = ["money", "buying", "regular", "other"];

function ago(from: Date, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return `${Math.floor(h / 24)}d`;
}

function WindowClock({ h }: { h: number }) {
  if (h <= 0) return <span className="text-2xs font-semibold text-muted">Window closed · template only</span>;
  const pct = Math.max(4, (h / 24) * 100);
  const color = cssColor(h < 3 ? "red" : h < 8 ? "gold" : "emerald");
  return (
    <span className="flex items-center gap-2" title="WhatsApp allows free replies for 24 hours after the customer's last message">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-track">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className={cn("tabular text-2xs font-semibold", h < 3 ? "text-danger" : "text-ink-2")}>{h < 1 ? `${Math.round(h * 60)}m left` : `${Math.floor(h)}h left`}</span>
    </span>
  );
}

function ItemCard({ it, now, canOperate }: { it: InboxItem; now: Date; canOperate: boolean }) {
  return (
    <li className="rounded-control border border-line bg-panel p-3 shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/dashboard/customers/${it.customerId}`} className="min-w-0 truncate text-sm font-semibold text-ink hover:underline">
          {it.name}
        </Link>
        <span className="tabular shrink-0 text-2xs text-muted" title="Waiting since their first unanswered message">
          waiting {ago(it.waitingSince, now)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink-2">
        {it.lastKind === "media" ? "📎 " : it.lastKind === "order" ? "🛒 " : ""}
        {it.lastText}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {it.cart && (
          <Badge tone="amber">
            {it.cart.ref} · {formatValue(it.cart.total, "inr")}
            {it.cart.paymentRequested ? " · pay link sent" : ""}
          </Badge>
        )}
        {it.paidOrders > 0 && (
          <Badge tone="blue">
            {it.paidOrders} order{it.paidOrders === 1 ? "" : "s"} · {formatValue(it.lifetimeValue, "inr")}
          </Badge>
        )}
        {it.openCount > 1 && <Badge tone="gray">{it.openCount} messages</Badge>}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <WindowClock h={it.windowLeftH} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link href={`/dashboard/replies?r=${it.latestReplyId}`} className={buttonClass("primary", "sm")}>
          <MessageCircle aria-hidden className="size-3.5" /> Reply
        </Link>
        {canOperate && it.cart && !it.cart.paymentRequested && (
          <ActionButton action={requestPayment.bind(null, it.cart.id)} confirm={`Send ${it.name} the WhatsApp “Review and pay” message for ${it.cart.ref}?`}>
            <CreditCard aria-hidden className="size-3.5" /> Pay link
          </ActionButton>
        )}
        {canOperate && !it.cart && it.buyingIntent && it.windowLeftH > 0 && (
          <ActionButton action={sendCatalogue.bind(null, it.customerId)} title="Send the WhatsApp catalogue (free inside the 24-hour window)">
            <Store aria-hidden className="size-3.5" /> Catalogue
          </ActionButton>
        )}
        {canOperate && (
          <ActionButton action={setReplyHandled.bind(null, it.latestReplyId, true)} variant="ghost" title="Mark this conversation handled">
            Done
          </ActionButton>
        )}
      </div>
    </li>
  );
}

export default async function PriorityInboxPage() {
  const scope = await getScope();
  const now = new Date();
  const items = await inboxPriority(ownedMessages(scope), now);

  const byLane = (l: Lane) => items.filter((i) => i.lane === l);
  const closing = items.filter((i) => i.windowLeftH > 0 && i.windowLeftH < 3).length;
  const closed = items.filter((i) => i.windowLeftH <= 0).length;
  const cartValue = items.reduce((n, i) => n + (i.cart?.total ?? 0), 0);
  const oldest = items.reduce<Date | null>((d, i) => (!d || i.waitingSince < d ? i.waitingSince : d), null);
  const slices: Slice[] = ORDER.map((l) => ({ key: l, label: LANES[l].title, value: byLane(l).length, color: LANES[l].color, href: `#lane-${l}`, sub: LANES[l].hint }));

  return (
    <>
      <PageHeader
        title="Replies"
        description="Open conversations sorted by what's at stake and how long you can still reply for free."
        tabs={<InboxTabs active="priority" />}
      />

      {items.length === 0 ? (
        <Card className="card-3d">
          <EmptyState icon={<Inbox3D />} title="All caught up">
            No open conversations. New customer messages will land here, most valuable first.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="card-3d">
            <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <DonutPanel slices={slices} centerLabel="open chats" label="Open conversations by lane" size={150} />
              </div>
              <div className="grid grid-cols-2 content-center gap-2.5 lg:col-span-5">
                <StatChip label="In open carts" value={formatValue(cartValue, "inr")} tone={cartValue ? "warn" : "ink"} />
                <StatChip label="Closing < 3h" value={fmtNumber(closing)} tone={closing ? "bad" : "ink"} hint="Free reply window ends within 3 hours" />
                <StatChip label="Window closed" value={fmtNumber(closed)} hint="Only a template can be sent now" />
                <StatChip label="Longest wait" value={oldest ? ago(oldest, now) : "—"} />
              </div>
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 md:grid-cols-2 2xl:grid-cols-4">
            {ORDER.map((l) => {
              const lane = byLane(l);
              return (
                <section key={l} id={`lane-${l}`} aria-labelledby={`lane-${l}-h`} className="scroll-mt-24">
                  <Card className="card-3d h-full bg-subtle/60">
                    <CardHeader
                      title={
                        <span id={`lane-${l}-h`} className="flex items-center gap-2">
                          <span aria-hidden className="size-2.5 rounded-full" style={{ background: cssColor(LANES[l].color) }} />
                          {LANES[l].title}
                          <span className="tabular font-normal text-muted">{lane.length}</span>
                        </span>
                      }
                      description={LANES[l].hint}
                    />
                    {lane.length ? (
                      <ul className="space-y-2.5 p-3">
                        {lane.map((it) => (
                          <ItemCard key={it.customerId} it={it} now={now} canOperate={scope.canOperate} />
                        ))}
                      </ul>
                    ) : (
                      <p className="p-4 text-sm text-muted">Nothing here.</p>
                    )}
                  </Card>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
