import { ChevronDown, ChevronLeft, ChevronRight, Download, MessagesSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Picker } from "@/components/picker";
import { Badge, buttonClass, Card, EmptyState, FilterChips, PageHeader, rowClass, StatusBadge, Table, Td, Th } from "@/components/ui";
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
      include: { customer: true, run: { include: { campaign: { select: { name: true } } } }, sender: { select: { label: true } } },
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

  const filtered = Boolean(p.q || p.status || p.campaign || p.range);

  return (
    <>
      <PageHeader
        title="Message log"
        description="Every WhatsApp message sent to your customers, with live delivery and read status."
        inlineActions
        actions={
          <a href={`/api/messages/export?${exportQs}`} className={cn(buttonClass("secondary"), "max-sm:px-3.5")} aria-label="Export CSV">
            <Download aria-hidden className="size-4" />
            <span>
              <span className="max-sm:sr-only">Export </span>CSV
            </span>
          </a>
        }
        tabs={
          <FilterChips
            label="Message status"
            items={[{ key: "", label: "All", n: allCount }, ...MESSAGE_STATUSES.map((s) => ({ key: s, label: s[0] + s.slice(1).toLowerCase(), n: byStatus.find((b) => b.status === s)?._count ?? 0 }))].map((s) => ({
              href: href(p, { status: s.key || undefined, page: undefined }),
              label: s.label,
              count: fmtNumber(s.n),
              active: (p.status ?? "") === s.key,
            }))}
          />
        }
      />

      <Card>
        <form role="search" aria-label="Filter messages" className="grid gap-2 border-b border-line p-3 sm:flex sm:flex-wrap">
          {p.status && <input type="hidden" name="status" value={p.status} />}
          <div className="relative min-w-0 sm:min-w-56 sm:flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="q" type="search" enterKeyHint="search" defaultValue={p.q} placeholder="Search name, phone or template" aria-label="Search name, phone or template" className="field pl-10" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Picker
              name="campaign"
              autoSubmit
              title="Campaign"
              defaultValue={p.campaign ?? ""}
              className="sm:w-52"
              options={[{ value: "", label: "All campaigns" }, { value: "test", label: "Test sends" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Picker
              name="range"
              autoSubmit
              title="Time range"
              defaultValue={p.range ?? ""}
              className="sm:w-44"
              options={[
                { value: "", label: "All time" },
                { value: "1d", label: "Last 24 hours" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
              ]}
            />
          </div>
          <button className={cn(buttonClass("secondary"), "max-sm:hidden")}>Filter</button>
          {filtered && (
            <Link href="/dashboard/messages" className={cn(buttonClass("ghost"), "max-sm:h-9 max-sm:justify-self-start max-sm:px-1 max-sm:text-sm")}>
              Clear filters
            </Link>
          )}
        </form>

        {rows.length ? (
          <>
            {/* Phones: one row per message, status always visible; tap to see the text and timings. */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((m) => (
                <li key={m.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none gap-3 px-4 py-3 transition-colors active:bg-sunken [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium text-ink">{m.customer.name}</p>
                          <StatusBadge status={m.status} />
                        </div>
                        <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                          <span className="truncate font-mono">{m.templateName}</span>
                          <span className="tabular shrink-0">{fmtDate(m.sentAt ?? m.failedAt ?? m.createdAt, "d MMM, h:mm a")}</span>
                        </p>
                        {m.error && <p className="mt-1 line-clamp-2 text-xs text-danger">{m.error}</p>}
                      </div>
                      <ChevronDown aria-hidden className="mt-1 size-4 shrink-0 text-muted transition group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 px-4 pb-4">
                      {m.body && <p className="whitespace-pre-wrap rounded-control bg-chat p-3 text-sm leading-snug text-ink">{m.body}</p>}
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <div><dt className="text-muted">Phone</dt><dd className="tabular text-ink">{formatPhone(m.customer.phone)}</dd></div>
                        <div><dt className="text-muted">Campaign</dt><dd className="truncate text-ink">{m.run?.campaign.name ?? "Test send"}</dd></div>
                        {m.sender && <div><dt className="text-muted">Sent from</dt><dd className="truncate text-ink">{m.sender.label}</dd></div>}
                        <div><dt className="text-muted">Delivered</dt><dd className="tabular text-ink">{m.deliveredAt ? fmtDate(m.deliveredAt, "d MMM, h:mm a") : "—"}</dd></div>
                        <div><dt className="text-muted">Read</dt><dd className="tabular text-ink">{m.readAt ? fmtDate(m.readAt, "d MMM, h:mm a") : "—"}</dd></div>
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

            <div className="max-sm:hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    <Th>Message</Th>
                    <Th className="max-lg:hidden">Campaign</Th>
                    <Th>Status</Th>
                    <Th numeric>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className={rowClass}>
                      <Td className="min-w-40">
                        <p className="font-medium text-ink">{m.customer.name}</p>
                        <p className="tabular text-xs text-muted">{formatPhone(m.customer.phone)}</p>
                      </Td>
                      <Td className="max-w-md">
                        <details className="group">
                          <summary className="cursor-pointer list-none rounded-control [&::-webkit-details-marker]:hidden">
                            <span className="font-mono text-xs text-ink-2">{m.templateName}</span>
                            {m.body && <p className="line-clamp-1 text-xs text-muted group-open:hidden">{m.body}</p>}
                          </summary>
                          {m.body && <p className="mt-2 whitespace-pre-wrap rounded-control bg-chat p-3 text-xs text-ink">{m.body}</p>}
                        </details>
                        {m.error && <p className="mt-1 text-xs text-danger">{m.error}</p>}
                        <p className="mt-1 text-xs text-muted lg:hidden">{m.run?.campaign.name ?? "Test send"}</p>
                      </Td>
                      <Td className="text-xs text-ink-2 max-lg:hidden">
                        {m.run?.campaign.name ?? <Badge>Test send</Badge>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.status !== "QUEUED" && <Badge tone={m.provider === "LOCAL" ? "violet" : "blue"}>{m.provider === "LOCAL" ? "Local" : (m.sender?.label ?? "Meta")}</Badge>}
                          {m.simulated && <Badge tone="amber">Demo</Badge>}
                        </div>
                      </Td>
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                      <Td numeric className="whitespace-nowrap text-xs text-muted">
                        <p>{fmtDate(m.sentAt ?? m.failedAt ?? m.createdAt, "d MMM, h:mm a")}</p>
                        {m.readAt ? <p>Read {fmtDate(m.readAt, "h:mm a")}</p> : m.deliveredAt ? <p>Delivered {fmtDate(m.deliveredAt, "h:mm a")}</p> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState icon={<MessagesSquare className="size-5" />} title="No messages found">
            {filtered ? "Try clearing the filters." : "Messages appear here as soon as a campaign or test send goes out."}
          </EmptyState>
        )}

        {total > PAGE_SIZE && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
            <span className="tabular">
              {fmtNumber((page - 1) * PAGE_SIZE + 1)}–{fmtNumber(Math.min(page * PAGE_SIZE, total))} of {fmtNumber(total)}
            </span>
            <div className="flex gap-2">
              <Link aria-disabled={page <= 1 || undefined} href={href(p, { page: String(page - 1) })} className={buttonClass("secondary", "sm")}>
                <ChevronLeft aria-hidden className="size-4" /> Prev
              </Link>
              <Link aria-disabled={page >= pages || undefined} href={href(p, { page: String(page + 1) })} className={buttonClass("secondary", "sm")}>
                Next <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </nav>
        )}
      </Card>
    </>
  );
}
