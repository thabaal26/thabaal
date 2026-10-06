import { ChevronDown, ChevronLeft, ChevronRight, Download, MessagesSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoSelect } from "@/components/auto-select";
import { Badge, buttonClass, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { MESSAGE_STATUSES, messageWhere } from "@/lib/queries";
import { getScope, owned, ownedMessages } from "@/lib/session";

export const metadata: Metadata = { title: "Message log" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
type Params = { q?: string; status?: string; campaign?: string; range?: string; page?: string };

function href(p: Params, patch: Partial<Params>) {
  const next = { ...p, ...patch };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
  return `/dashboard/messages${qs.size ? `?${qs}` : ""}`;
}

export default async function MessagesPage({ searchParams }: PageProps<"/dashboard/messages">) {
  const raw = await searchParams;
  const p: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const page = Math.max(1, Number(p.page) || 1);
  const scope = await getScope();
  const where = { ...messageWhere(p), ...ownedMessages(scope) };

  const [rows, total, byStatus, campaigns] = await Promise.all([
    db.message.findMany({
      where,
      include: { customer: true, run: { include: { campaign: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.message.count({ where }),
    db.message.groupBy({ by: ["status"], where: { ...messageWhere({ ...p, status: undefined }), ...ownedMessages(scope) }, _count: true }),
    db.campaign.findMany({ where: owned(scope), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allCount = byStatus.reduce((a, s) => a + s._count, 0);
  const exportQs = new URLSearchParams(Object.entries({ ...p, page: undefined }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader
        title="Message log"
        description="Every WhatsApp message sent to your customers, with live delivery and read status."
        actions={
          <a href={`/api/messages/export?${exportQs}`} className={buttonClass("secondary")}>
            <Download className="size-4" /> Export CSV
          </a>
        }
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ key: "", label: "All", n: allCount }, ...MESSAGE_STATUSES.map((s) => ({ key: s, label: s[0] + s.slice(1).toLowerCase(), n: byStatus.find((b) => b.status === s)?._count ?? 0 }))].map((s) => (
          <Link
            key={s.key}
            href={href(p, { status: s.key || undefined, page: undefined })}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-95 sm:h-auto sm:px-3 sm:py-1.5 sm:text-xs",
              (p.status ?? "") === s.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink/30",
            )}
          >
            {s.label}
            <span className={cn("tabular", (p.status ?? "") === s.key ? "text-white/60" : "text-muted")}>{fmtNumber(s.n)}</span>
          </Link>
        ))}
      </div>

      <Card>
        <form className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:flex">
          {p.status && <input type="hidden" name="status" value={p.status} />}
          <div className="relative col-span-2 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="q" type="search" enterKeyHint="search" defaultValue={p.q} placeholder="Search name, phone or template" className="field pl-10" />
          </div>
          <AutoSelect name="campaign" aria-label="Campaign" defaultValue={p.campaign ?? ""} className="field sm:w-48">
            <option value="">All campaigns</option>
            <option value="test">Test sends</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </AutoSelect>
          <AutoSelect name="range" aria-label="Time range" defaultValue={p.range ?? ""} className="field sm:w-40">
            <option value="">All time</option>
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </AutoSelect>
          <div className="hidden sm:block"><button className={buttonClass("secondary")}>Filter</button></div>
        </form>

        {rows.length ? (
          <>
          {/* Phones: one tappable card per message, status always visible. */}
          <ul className="divide-y divide-line sm:hidden">
            {rows.map((m) => (
              <li key={m.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none gap-3 px-4 py-3.5 active:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">{m.customer.name}</p>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate font-mono">{m.templateName}</span>
                        <span className="tabular shrink-0">{fmtDate(m.sentAt ?? m.failedAt ?? m.createdAt, "d MMM, h:mm a")}</span>
                      </p>
                      {m.error && <p className="mt-1 line-clamp-2 text-xs text-rose-600">{m.error}</p>}
                    </div>
                    <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 px-4 pb-4">
                    {m.body && <p className="whitespace-pre-wrap rounded-xl bg-chat p-3 text-[13px] leading-snug text-ink">{m.body}</p>}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div><dt className="text-muted">Phone</dt><dd className="tabular">{formatPhone(m.customer.phone)}</dd></div>
                      <div><dt className="text-muted">Campaign</dt><dd className="truncate">{m.run?.campaign.name ?? "Test send"}</dd></div>
                      <div><dt className="text-muted">Delivered</dt><dd>{m.deliveredAt ? fmtDate(m.deliveredAt, "d MMM, h:mm a") : "—"}</dd></div>
                      <div><dt className="text-muted">Read</dt><dd>{m.readAt ? fmtDate(m.readAt, "d MMM, h:mm a") : "—"}</dd></div>
                    </dl>
                    <div className="flex gap-1">
                      {m.status !== "QUEUED" && <Badge tone={m.provider === "LOCAL" ? "violet" : "blue"}>{m.provider === "LOCAL" ? "Local session" : "Meta API"}</Badge>}
                      {m.simulated && <Badge tone="amber">Demo</Badge>}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Message</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((m) => (
                  <tr key={m.id} className="align-top transition hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.customer.name}</p>
                      <p className="tabular text-xs text-muted">{formatPhone(m.customer.phone)}</p>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <details className="group">
                        <summary className="cursor-pointer list-none">
                          <span className="font-mono text-xs text-ink-2">{m.templateName}</span>
                          {m.body && <p className="line-clamp-1 text-xs text-muted group-open:hidden">{m.body}</p>}
                        </summary>
                        {m.body && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-chat p-3 text-xs text-ink">{m.body}</p>}
                      </details>
                      {m.error && <p className="mt-1 text-xs text-rose-600">{m.error}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">
                      {m.run?.campaign.name ?? <Badge>Test send</Badge>}
                      <div className="mt-1 flex gap-1">
                        {m.status !== "QUEUED" && <Badge tone={m.provider === "LOCAL" ? "violet" : "blue"}>{m.provider === "LOCAL" ? "Local" : "Meta"}</Badge>}
                        {m.simulated && <Badge tone="amber">Demo</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="tabular px-4 py-3 text-right text-xs text-muted">
                      <p>{fmtDate(m.sentAt ?? m.failedAt ?? m.createdAt, "d MMM, h:mm a")}</p>
                      {m.readAt ? <p>Read {fmtDate(m.readAt, "h:mm a")}</p> : m.deliveredAt ? <p>Delivered {fmtDate(m.deliveredAt, "h:mm a")}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <EmptyState icon={<MessagesSquare className="size-5" />} title="No messages found">
            {p.q || p.status || p.campaign || p.range ? "Try clearing the filters." : "Messages appear here as soon as a campaign or test send goes out."}
          </EmptyState>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
            <span className="tabular">
              {fmtNumber((page - 1) * PAGE_SIZE + 1)}–{fmtNumber(Math.min(page * PAGE_SIZE, total))} of {fmtNumber(total)}
            </span>
            <div className="flex gap-1">
              <Link aria-disabled={page <= 1} href={href(p, { page: String(page - 1) })} className={cn(buttonClass("secondary", "sm"), page <= 1 && "pointer-events-none opacity-40")}>
                <ChevronLeft className="size-3.5" /> Prev
              </Link>
              <Link aria-disabled={page >= pages} href={href(p, { page: String(page + 1) })} className={cn(buttonClass("secondary", "sm"), page >= pages && "pointer-events-none opacity-40")}>
                Next <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
