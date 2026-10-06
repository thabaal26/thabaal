import { ArrowLeft, CheckCheck, Eye, MessageCircle, Send, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, CardHeader, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { setOptOut } from "../../actions/customers";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

type Entry =
  | { at: Date; type: "out"; id: string; template: string; campaign: string | null; status: string; body: string | null; readAt: Date | null; error: string | null }
  | { at: Date; type: "in"; id: string; text: string; kind: string };

export default async function CustomerPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const c = await db.customer.findFirst({
    where: { id, ...owned(scope) },
    include: {
      client: { select: { name: true } },
      messages: { include: { run: { select: { campaign: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 },
      replies: { orderBy: { receivedAt: "desc" }, take: 100 },
    },
  });
  if (!c) notFound();

  const sent = c.messages.filter((m) => !["QUEUED", "SKIPPED"].includes(m.status));
  const delivered = sent.filter((m) => m.status === "DELIVERED" || m.status === "READ").length;
  const read = sent.filter((m) => m.status === "READ").length;

  const timeline: Entry[] = [
    ...c.messages.map((m) => ({
      at: m.sentAt ?? m.createdAt, type: "out" as const, id: m.id, template: m.templateName, campaign: m.run?.campaign.name ?? null,
      status: m.status, body: m.body, readAt: m.readAt, error: m.error,
    })),
    ...c.replies.map((r) => ({ at: r.receivedAt, type: "in" as const, id: r.id, text: r.text, kind: r.kind })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // Every customer carries the client-wide tag (e.g. thenan-oils), so it says nothing here.
  const clientTag = c.client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const productTags = c.tags.filter((t) => t !== clientTag);

  return (
    <>
      <Link href="/dashboard/customers" className="-my-2 mb-1 inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-ink sm:mb-3 sm:text-xs">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>
      <PageHeader
        title={c.name}
        description={`${formatPhone(c.phone)}${!scope.clientId ? ` · ${c.client.name}` : ""} · customer since ${fmtDate(c.createdAt, "d MMM yyyy")}`}
        actions={
          <>
            <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
              <MessageCircle className="size-4" /> Message on WhatsApp
            </a>
            {scope.isAdmin && (
              <ActionButton action={setOptOut.bind(null, c.id, !c.optedOut)} size="md">{c.optedOut ? "Opt back in" : "Opt out"}</ActionButton>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Messages received" value={fmtNumber(sent.length)} sub={c.optedOut ? "Opted out of campaigns" : "From your campaigns"} icon={<Send className="size-4" />} />
        <Stat label="Read" value={`${pct(read, delivered)}%`} sub={`${read} of ${delivered} delivered`} icon={<Eye className="size-4" />} accent="bg-violet-50 text-violet-700" />
        <Stat label="Replies" value={fmtNumber(c.replies.length)} sub={c.replies[0] ? `Last ${fmtDate(c.replies[0].receivedAt, "d MMM")}` : "None yet"} icon={<CheckCheck className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Card className="h-fit">
          <CardHeader title="What they buy" />
          <div className="space-y-4 p-4 sm:p-5">
            {c.purchases ? (
              <p className="flex gap-2 text-sm"><ShoppingBag className="mt-0.5 size-4 shrink-0 text-brand" />{c.purchases}</p>
            ) : (
              <p className="text-sm text-muted">No purchase recorded.</p>
            )}
            {(productTags.length > 0 || c.optedOut) && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Groups</p>
                <div className="flex flex-wrap gap-1">
                  {c.optedOut && <Badge tone="red">Opted out</Badge>}
                  {productTags.map((t) => (
                    <Link key={t} href={`/dashboard/customers?tag=${encodeURIComponent(t)}`}><Badge>{t === "no-item-info" ? "no item recorded" : t}</Badge></Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Conversation" description="Campaign messages and their replies, newest first." />
          {timeline.length ? (
            <ol className="chat-wall space-y-3 p-4 sm:p-5">
              {timeline.map((e) =>
                e.type === "in" ? (
                  <li key={e.id} className="flex">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-bubble px-3 py-2 text-sm shadow-sm">
                      {e.kind === "button" && <p className="mb-0.5 text-[11px] font-medium text-brand-deep">Tapped a button</p>}
                      <p className="whitespace-pre-wrap">{e.text}</p>
                      <p className="mt-1 text-right text-[10px] text-muted">{fmtDate(e.at, "d MMM, h:mm a")}</p>
                    </div>
                  </li>
                ) : (
                  <li key={e.id} className="flex justify-end">
                    <div className={cn("max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm", e.status === "FAILED" ? "bg-rose-50" : "bg-[#d9fdd3]")}>
                      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2">
                        <span className="font-mono">{e.template}</span>
                        {e.campaign && <span className="text-muted">· {e.campaign}</span>}
                      </p>
                      {e.body && <p className="line-clamp-6 whitespace-pre-wrap">{e.body}</p>}
                      {e.error && <p className="mt-1 text-xs text-rose-700">{e.error}</p>}
                      <p className="mt-1.5 flex items-center justify-end gap-2 text-[10px] text-muted">
                        {fmtDate(e.at, "d MMM, h:mm a")} <StatusBadge status={e.status} />
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No messages with this customer yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
