import type { Prisma } from "@prisma/client";
import { QrCode, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Picker } from "@/components/picker";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { deleteCustomer, setOptOut } from "../actions/customers";
import { CustomerMenu, CustomerTools } from "./customer-tools";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tag = typeof sp.tag === "string" ? sp.tag : "";
  // Area filter: "region:Madurai city", "loc:Sellur" or "none" (no location noted).
  const area = typeof sp.area === "string" ? sp.area : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const scope = await getScope();

  const where: Prisma.CustomerWhereInput = {
    ...owned(scope),
    ...(tag === "__optout" ? { optedOut: true } : tag ? { tags: { has: tag } } : {}),
    ...(area === "none" ? { location: null } : area.startsWith("region:") ? { region: area.slice(7) } : area.startsWith("loc:") ? { location: area.slice(4) } : {}),
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] }),
  };
  const [rows, total, tags, areas] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.customer.count({ where }),
    db.$queryRaw<{ tag: string; n: bigint }[]>`
      SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer"
      WHERE ${scope.clientId}::text IS NULL OR "clientId" = ${scope.clientId} GROUP BY 1 ORDER BY 2 DESC, 1`,
    db.customer.groupBy({ by: ["region", "location"], where: owned(scope), _count: true }),
  ]);
  const regionCount = (r: string | null) => areas.filter((a) => a.region === r).reduce((n, a) => n + a._count, 0);
  const noLocation = areas.filter((a) => !a.location).reduce((n, a) => n + a._count, 0);
  const areaOptions = [
    { value: "", label: "All areas" },
    ...["Madurai city", "Outside Madurai", "Not sure"].filter((r) => regionCount(r)).map((r) => ({ value: `region:${r}`, label: r, hint: `${fmtNumber(regionCount(r))} customers` })),
    ...(noLocation ? [{ value: "none", label: "No location noted", hint: `${fmtNumber(noLocation)} customers` }] : []),
    ...areas
      .filter((a) => a.location)
      .sort((a, b) => b._count - a._count || a.location!.localeCompare(b.location!))
      .map((a) => ({ value: `loc:${a.location}`, label: a.location!, hint: `${a.region ?? "Area"} · ${fmtNumber(a._count)} customer${a._count === 1 ? "" : "s"}` })),
  ];
  // Every customer of a client carries its client-wide tag (e.g. thenan-oils); it adds nothing per row.
  // Every customer of a client carries the client's own tag (e.g. "Thenan Oils"); it says nothing here, so hide it
  // however it was spelled ("thenan-oils", "Thenan Oils", "thenan_oils").
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const clientTag = scope.clientName ? plain(scope.clientName) : undefined;
  const rowTags = (tags: string[], clientName?: string) => tags.filter((t) => plain(t) !== (clientName ? plain(clientName) : clientTag));
  const tagLabel = (t: string) => (t === "no-item-info" ? "No item recorded" : t.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
  const qs = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ q, tag, area, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/customers${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${fmtNumber(total)}${tag || q || area ? " matching" : ""} customers${scope.clientName ? ` of ${scope.clientName}` : ""}. Customers who reply STOP are opted out automatically.`}
        actions={scope.clientId ? <><Link href="/dashboard/customers/grow" className={buttonClass("secondary")}><QrCode className="size-4" /> Get more customers</Link>{scope.isAdmin && <CustomerTools />}</> : undefined}
      />

      <Card>
        <form className="grid gap-2 border-b border-line p-3 sm:flex">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="Search by name or phone number" className="field pl-10" />
          </div>
          <div className="grid gap-2 sm:contents">
          <Picker
            name="tag"
            autoSubmit
            title="Show customers"
            aria-label="Filter by product"
            defaultValue={tag}
            className="sm:w-56"
            options={[
              { value: "", label: "All customers" },
              { value: "__optout", label: "Opted out" },
              ...tags.filter((t) => plain(t.tag) !== clientTag).map((t) => ({ value: t.tag, label: tagLabel(t.tag), hint: `${fmtNumber(Number(t.n))} customers` })),
            ]}
          />
          {areaOptions.length > 1 && (
            <Picker name="area" autoSubmit title="Area" aria-label="Filter by area" defaultValue={area} className="sm:w-52" options={areaOptions} />
          )}
          </div>
          <div className="hidden sm:block"><button className={buttonClass("secondary")}>Search</button></div>
        </form>

        {rows.length ? (
          <>
          <ul className="divide-y divide-line sm:hidden">
            {rows.map((c) => (
              <li key={c.id} className="relative flex items-center gap-3 px-4 py-3 active:bg-canvas">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep">
                  {c.name.trim().slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/customers/${c.id}`} className="block truncate font-medium after:absolute after:inset-0">{c.name}</Link>
                  <p className="tabular truncate text-xs text-muted">
                    {formatPhone(c.phone)}
                    {c.location && ` · ${c.location}`}
                    {c.messages[0] && ` · ${fmtDate(c.messages[0].createdAt, "d MMM")} ${c.messages[0].status.toLowerCase()}`}
                  </p>
                  {c.purchases && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{c.purchases}</p>}
                  {(c.optedOut || c.unreachable || rowTags(c.tags, c.client?.name).length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.optedOut && <Badge tone="red">Opted out</Badge>}
                      {c.unreachable && <Badge tone="amber">Can&apos;t receive</Badge>}
                      {rowTags(c.tags, c.client?.name).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  )}
                </div>
                {scope.isAdmin && (
                  <div className="relative z-10">
                    <CustomerMenu
                      name={c.name}
                      optedOut={c.optedOut}
                      toggle={setOptOut.bind(null, c.id, !c.optedOut)}
                      remove={deleteCustomer.bind(null, c.id)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  {!scope.clientId && <th className="px-4 py-2.5 font-medium">Client</th>}
                  <th className="px-4 py-2.5 font-medium">Area</th>
                  <th className="px-4 py-2.5 font-medium">Purchased</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                  <th className="px-4 py-2.5 font-medium">Last message</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                      <p className="tabular text-xs text-muted">{formatPhone(c.phone)}</p>
                    </td>
                    {!scope.clientId && <td className="px-4 py-3 text-xs text-ink-2">{c.client.name}</td>}
                    <td className="px-4 py-3 text-xs">
                      {c.location ? (
                        <>
                          <Link href={qs({ area: `loc:${c.location}`, page: undefined })} className="text-ink-2 hover:underline">{c.location}</Link>
                          <p className="text-muted">{c.region}</p>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-ink-2">{c.purchases ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.optedOut && <Badge tone="red">Opted out</Badge>}
                        {c.unreachable && <Badge tone="amber">Can&apos;t receive</Badge>}
                        {rowTags(c.tags, c.client?.name).map((t) => (
                          <Link key={t} href={qs({ tag: t, page: undefined })}><Badge>{t}</Badge></Link>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{c.messages[0] ? `${fmtDate(c.messages[0].createdAt, "d MMM")} · ${c.messages[0].status.toLowerCase()}` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{fmtDate(c.createdAt, "d MMM yyyy")}</td>
                    <td className="px-4 py-3">
                      {scope.isAdmin && (
                        <div className="flex justify-end gap-1">
                          <ActionButton action={setOptOut.bind(null, c.id, !c.optedOut)} variant="ghost">{c.optedOut ? "Opt in" : "Opt out"}</ActionButton>
                          <ActionButton action={deleteCustomer.bind(null, c.id)} variant="ghost" confirm={`Delete ${c.name} and their message history?`}>Delete</ActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <EmptyState icon={<Users className="size-5" />} title={q || tag || area ? "No matching customers" : "No customers yet"}>
            {q || tag || area ? "Try a different search or filter." : scope.isAdmin ? "Import your customer list as a CSV to get started." : "Customers will appear here once they're added."}
          </EmptyState>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span className="tabular">{fmtNumber((page - 1) * PAGE_SIZE + 1)}–{fmtNumber(Math.min(page * PAGE_SIZE, total))} of {fmtNumber(total)}</span>
            <div className="flex gap-1">
              <Link href={qs({ page: String(page - 1) })} className={cn(buttonClass("secondary", "sm"), page <= 1 && "pointer-events-none opacity-40")}>Prev</Link>
              <Link href={qs({ page: String(page + 1) })} className={cn(buttonClass("secondary", "sm"), page * PAGE_SIZE >= total && "pointer-events-none opacity-40")}>Next</Link>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
