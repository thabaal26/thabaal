import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Search, Users, UserX } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { Picker } from "@/components/picker";
import { ActionButton } from "@/components/action-button";
import { Avatar, Badge, buttonClass, Card, EmptyState, PageHeader, rowClass, Stat, Table, Td, Th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { marketingPaused } from "@/lib/held";
import { customerFilters, customerWhere } from "@/lib/customer-query";
import { ActiveFilters, FilterBar } from "@/components/filter-bar";
import { activeCount as filterCount, filterQuery, keepFilters, readFilters, resolvePeriod, type FilterSection } from "@/lib/filters";
import { ACTIVITY, customerSegmentIds, filterOptions, STAGES } from "@/lib/filter-scope";
import { computeCustomerLoyalty, isInternalLoyaltyTag } from "@/lib/loyalty";
import { homeCityOf, regionsFor } from "@/lib/regions";
import { readFields } from "@/lib/custom-fields";
import { getScope, owned } from "@/lib/session";
import { deleteCustomer, setOptOut } from "../actions/customers";
import { CustomerActions, CustomerMenu, PendingCustomersBanner } from "./customer-tools";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const CUSTOMER_FILTERS: FilterSection[] = ["period", "products"];

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const sp = await searchParams;
  // Area filter: "region:Madurai city", "loc:Anna Nagar" or "none" (no location noted).
  const { q, tag, area } = customerFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const scope = await getScope();

  // Period and catalogue product filters live in FilterBar; tag, area, stage, and activity have dedicated toolbar pickers.
  const filters = keepFilters(readFilters(sp, "all"), CUSTOMER_FILTERS);
  const period = resolvePeriod(filters);
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const act = typeof sp.act === "string" ? sp.act : "";
  const baseExtra: Record<string, string | undefined> = {
    q: q || undefined,
    tag: tag || undefined,
    area: area || undefined,
    stage: stage || undefined,
    act: act || undefined,
  };
  const listQs = filterQuery(filters, baseExtra, "all");
  const exportHref = `/api/customers/export${listQs ? `?${listQs}` : ""}`;
  // First round: who the filters cover, the filter choices, and the figures that don't depend on them.
  const [segment, baseWhere, filterOpts, [tags, areas, homeClient, totalAll, optedOutCount, pendingRows]] = await Promise.all([
    scope.clientId
      ? customerSegmentIds(scope.clientId, filters, { stage, act, ...(filters.range !== "all" && { start: period.start, end: period.end }) })
      : null,
    customerWhere(scope, { q, tag, area }),
    scope.clientId ? filterOptions(scope.clientId) : null,
    Promise.all([
      db.$queryRaw<{ tag: string; n: bigint }[]>`
        SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer"
        WHERE ${scope.clientId}::text IS NULL OR "clientId" = ${scope.clientId} GROUP BY 1 ORDER BY 2 DESC, 1`,
      db.customer.groupBy({ by: ["region", "location"], where: owned(scope), _count: true }),
      scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { homeCity: true, customFields: true } }) : null,
      db.customer.count({ where: owned(scope) }),
      db.customer.count({ where: { ...owned(scope), OR: [{ optedOut: true }, { unreachable: true }] } }),
      scope.canManage
        ? db.pendingCustomer.findMany({
            where: owned(scope),
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, rawPhone: true, location: true, payment: true, items: true, notes: true, page: true },
          })
        : Promise.resolve([]),
    ]),
  ]);
  const where = { ...baseWhere, ...(segment && { id: { in: segment } }) };
  // Then the page of customers itself.
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } },
        orders: { where: { status: { not: "CANCELLED" } }, select: { total: true, status: true, paidAt: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.customer.count({ where }),
  ]);
  // Customers Meta is currently holding marketing back from (their campaign messages wait).
  const paused = await marketingPaused(rows.map((c) => c.id));
  const regionCount = (r: string | null) => areas.filter((a) => a.region === r).reduce((n, a) => n + a._count, 0);
  const noLocation = areas.filter((a) => !a.location).reduce((n, a) => n + a._count, 0);
  const reachableAll = Math.max(0, totalAll - optedOutCount);
  // Regions are relative to the client's home city; any other saved region names still get a choice.
  const regions = regionsFor(homeCityOf(homeClient));
  const regionChoices = [...regions, ...new Set(areas.map((a) => a.region).filter((r): r is string => !!r && !regions.includes(r)))];
  const homeCount = regionCount(regions[0]);
  const areaOptions = [
    { value: "", label: "All areas" },
    ...regionChoices.filter((r) => regionCount(r)).map((r) => ({ value: `region:${r}`, label: r, hint: `${fmtNumber(regionCount(r))} customers` })),
    ...(noLocation ? [{ value: "none", label: "No location noted", hint: `${fmtNumber(noLocation)} customers` }] : []),
    ...areas
      .filter((a) => a.location)
      .sort((a, b) => b._count - a._count || a.location!.localeCompare(b.location!))
      .map((a) => ({ value: `loc:${a.location}`, label: a.location!, hint: `${a.region ?? "Area"} · ${fmtNumber(a._count)} customer${a._count === 1 ? "" : "s"}` })),
  ];
  // Every customer of a client carries the client's own tag (e.g. "Thenan Oils"); it says nothing here, so hide it
  // however it was spelled ("thenan-oils", "Thenan Oils", "thenan_oils").
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const clientTag = scope.clientName ? plain(scope.clientName) : undefined;
  const rowTags = (tags: string[], clientName?: string) =>
    tags.filter((t) => !isInternalLoyaltyTag(t) && plain(t) !== (clientName ? plain(clientName) : clientTag));
  const tagLabel = (t: string) =>
    t.startsWith("product:")
      ? t.slice(8)
      : t === "no-item-info"
        ? "No item recorded"
        : t.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const qs = (patch: Record<string, string | undefined>) => {
    const s = filterQuery(filters, { ...baseExtra, ...patch }, "all");
    return `/dashboard/customers${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(tag || q || area || stage || act || filterCount(filters) || filters.range !== "all");

  const loyaltyFor = (c: (typeof rows)[number]) => {
    const paidOrders = c.orders.filter((o) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status));
    const spent = paidOrders.reduce((s, o) => s + o.total, 0);
    return {
      paidCount: paidOrders.length,
      spent,
      summary: computeCustomerLoyalty({
        name: c.name,
        paidOrdersCount: paidOrders.length,
        totalSpent: spent,
        sheetPurchases: c.purchases,
        tags: c.tags,
      }),
    };
  };

  const flags = (c: (typeof rows)[number]) => {
    const { summary } = loyaltyFor(c);
    return (
      <>
        {summary.totalPoints > 0 && (
          <Badge tone={summary.tierTone}>
            {summary.tierLabel} · {fmtNumber(summary.totalPoints)} pts
          </Badge>
        )}
        {c.optedOut && <Badge tone="red">Opted out</Badge>}
        {c.unreachable && <Badge tone="amber">Can&apos;t receive</Badge>}
        {paused.has(c.id) && <Badge tone="amber">Offers paused till {fmtDate(paused.get(c.id)!, "d MMM")}</Badge>}
      </>
    );
  };
  const lastMessage = (c: (typeof rows)[number]) => (c.messages[0] ? `${fmtDate(c.messages[0].createdAt, "d MMM")} · ${c.messages[0].status.toLowerCase()}` : null);

  return (
    <>
      <PageHeader
        title="Customers"
        meta={
          <>
            <span className="tabular font-medium text-ink-2">{fmtNumber(total)}</span>
            {filtered ? " matching" : ""} customers{scope.clientName ? ` of ${scope.clientName}` : ""}
          </>
        }
        description="Everyone you sell to, who to reach today, and how to reward them."
        inlineActions
        actions={scope.clientId || scope.isAdmin ? <CustomerActions canManage={scope.canManage} hasClient={!!scope.clientId} regions={regions} fields={readFields(homeClient?.customFields, "customer")} exportHref={scope.canManage && total > 0 ? exportHref : null} exportCount={total} /> : undefined}
        tabs={
          <nav aria-label="Customer sub-views" className="inline-flex rounded-xl border border-line bg-card p-1 shadow-2xs">
            <Link
              href="/dashboard/customers"
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold transition",
                !tag ? "bg-ink text-canvas shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              All customers
            </Link>
            <Link
              href="/dashboard/customers?tag=lapsed"
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold transition",
                tag === "lapsed" ? "bg-ink text-canvas shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Groups to reach
            </Link>
            <Link
              href="/dashboard/customers?tag=loyalty"
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold transition",
                tag === "loyalty" ? "bg-ink text-canvas shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Loyalty
            </Link>
            <Link
              href="/dashboard/refills"
              className="inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold text-muted hover:text-ink transition"
            >
              Refills
            </Link>
          </nav>
        }
      />

      {scope.canManage && pendingRows.length > 0 && <PendingCustomersBanner rows={pendingRows} />}

      <section aria-label="Customer summary" className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-5 sm:gap-3.5 lg:grid-cols-4">
        <Stat
          label="Total directory"
          value={fmtNumber(totalAll)}
          sub={filtered ? `${fmtNumber(total)} matching filters` : "All saved contacts"}
          icon={<Users className="size-5 stroke-[2]" />}
          tone="brand"
        />
        <Stat
          label="Reachable on WhatsApp"
          value={fmtNumber(reachableAll)}
          sub={`${pct(reachableAll, totalAll)}% of directory`}
          icon={<CheckCircle2 className="size-5 stroke-[2]" />}
          tone="info"
          meter={pct(reachableAll, totalAll)}
        />
        <Stat
          label={regions[0]}
          value={fmtNumber(homeCount)}
          sub={noLocation > 0 ? `${fmtNumber(noLocation)} without area` : "Local delivery zone"}
          icon={<MapPin className="size-5 stroke-[2]" />}
          tone="violet"
        />
        <Stat
          label="Opted out / Unreachable"
          value={fmtNumber(optedOutCount)}
          sub={optedOutCount > 0 ? "Skipped by campaigns" : "Everyone can receive"}
          icon={<UserX className="size-5 stroke-[2]" />}
          tone={optedOutCount > 0 ? "amber" : "gold"}
        />
      </section>

      <Card>
        <form role="search" aria-label="Find customers" className="grid gap-2 border-b border-line bg-subtle/40 p-3 sm:flex sm:flex-wrap">
          <div className="relative min-w-0 sm:min-w-56 sm:flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input key={q} name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="Search by name or phone number" aria-label="Search by name or phone number" className="field pl-10" />
          </div>
          <div className={cn("grid gap-2 sm:contents", areaOptions.length > 1 && "grid-cols-2")}>
            <Picker
              name="tag"
              autoSubmit
              title="Customer group / tag"
              aria-label="Filter by group or tag"
              defaultValue={tag}
              className="sm:w-52"
              options={[
                { value: "", label: "All groups & tags" },
                { value: "__optout", label: "Opted out" },
                ...tags
                  .filter((t) => !isInternalLoyaltyTag(t.tag) && plain(t.tag) !== clientTag)
                  .map((t) => ({ value: t.tag, label: tagLabel(t.tag), hint: `${fmtNumber(Number(t.n))} customers` })),
              ]}
            />
            {areaOptions.length > 1 && <Picker name="area" autoSubmit title="Delivery area" aria-label="Filter by area" defaultValue={area} className="sm:w-48" options={areaOptions} />}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Picker name="stage" autoSubmit title="Customer stage" aria-label="Filter by stage" defaultValue={stage} className="sm:w-52" options={[...STAGES]} />
            <Picker name="act" autoSubmit title="Activity in the period" aria-label="Filter by activity" defaultValue={act} className="sm:w-52" options={[...ACTIVITY]} />
          </div>
          {[...new URLSearchParams(filterQuery(filters, {}, "all"))].map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          {filterOpts && (
            <FilterBar
              value={filters}
              options={filterOpts}
              basePath="/dashboard/customers"
              extra={baseExtra}
              defaultRange="all"
              sections={CUSTOMER_FILTERS}
              note="Pick a date period (for customer activity) or filter by catalogue products bought."
              periodLabel={filters.range === "all" ? "Any date" : period.label}
            />
          )}
          <button className={cn(buttonClass("secondary"), "max-sm:hidden")}>Search</button>
          {filtered && (
            <Link href="/dashboard/customers" className={cn(buttonClass("ghost"), "max-sm:h-9 max-sm:justify-self-start max-sm:px-1 max-sm:text-sm")}>
              Clear filters
            </Link>
          )}
        </form>
        {filterOpts && filterCount(filters) > 0 && (
          <div className="border-b border-line px-3 py-2.5">
            <ActiveFilters value={filters} options={filterOpts} basePath="/dashboard/customers" extra={baseExtra} defaultRange="all" />
          </div>
        )}
        {act && filters.range === "all" && (
          <p className="border-b border-line bg-warning-bg/50 px-3 py-2 text-xs text-ink-2">Activity filters look at all time. Pick a period with the calendar button to narrow it.</p>
        )}

        {rows.length ? (
          <>
            {/* Phones: one tappable row per customer. */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((c) => (
                <li key={c.id} className="relative flex items-start gap-3 px-4 py-3 transition-colors active:bg-sunken">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/customers/${c.id}`} className="block truncate font-medium text-ink after:absolute after:inset-0">
                      {c.name}
                    </Link>
                    <p className="tabular truncate text-xs text-muted">
                      {formatPhone(c.phone)}
                      {c.location && ` · ${c.location}`}
                      {lastMessage(c) && ` · ${lastMessage(c)}`}
                    </p>
                    {c.purchases && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{c.purchases}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden">
                      {flags(c)}
                      {rowTags(c.tags, c.client?.name).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </div>
                  {scope.canManage && (
                    <div className="relative z-10 -my-1 -mr-2">
                      <CustomerMenu name={c.name} optedOut={c.optedOut} toggle={setOptOut.bind(null, c.id, !c.optedOut)} remove={deleteCustomer.bind(null, c.id)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Larger screens: a table. Narrower ones fold the low-priority columns into the first. */}
            <div className="max-sm:hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    {!scope.clientId && <Th className="max-lg:hidden">Client</Th>}
                    <Th>Area</Th>
                    <Th className="max-xl:hidden">Purchased</Th>
                    <Th className="max-lg:hidden">Tags</Th>
                    <Th>Last message</Th>
                    <Th className="max-2xl:hidden">Added</Th>
                    {scope.canManage && <Th><span className="sr-only">Actions</span></Th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className={rowClass}>
                      <Td className="min-w-52">
                        <div className="flex items-start gap-2.5">
                          <Avatar name={c.name} />
                          <div className="min-w-0">
                            <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-ink hover:underline">
                              {c.name}
                            </Link>
                            <p className="tabular text-xs text-muted">{formatPhone(c.phone)}</p>
                            {!scope.clientId && <p className="text-xs text-ink-2 lg:hidden">{c.client.name}</p>}
                            {c.purchases && <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-ink-2 xl:hidden" title={c.purchases}>{c.purchases}</p>}
                            <div className="mt-1 flex flex-wrap gap-1 empty:hidden lg:hidden">
                              {flags(c)}
                              {rowTags(c.tags, c.client?.name).map((t) => <Badge key={t}>{t}</Badge>)}
                            </div>
                          </div>
                        </div>
                      </Td>
                      {!scope.clientId && <Td className="text-xs text-ink-2 max-lg:hidden">{c.client.name}</Td>}
                      <Td className="text-xs">
                        {c.location ? (
                          <>
                            <Link href={qs({ area: `loc:${c.location}`, page: undefined })} className="text-ink-2 hover:underline">
                              {c.location}
                            </Link>
                            <p className="text-muted">{c.region}</p>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="max-w-xs text-xs text-ink-2 max-xl:hidden">
                        {c.purchases ? <span className="line-clamp-2" title={c.purchases}>{c.purchases}</span> : <span className="text-muted">—</span>}
                      </Td>
                      <Td className="max-lg:hidden">
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {flags(c)}
                          {rowTags(c.tags, c.client?.name).map((t) => (
                            <Link key={t} href={qs({ tag: t, page: undefined })} className="rounded-full">
                              <Badge>{t}</Badge>
                            </Link>
                          ))}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted">{lastMessage(c) ?? "—"}</Td>
                      <Td className="tabular whitespace-nowrap text-xs text-muted max-2xl:hidden">{fmtDate(c.createdAt, "d MMM yyyy")}</Td>
                      {scope.canManage && (
                        <Td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <ActionButton action={setOptOut.bind(null, c.id, !c.optedOut)} variant="ghost" aria-label={`${c.optedOut ? "Opt in" : "Opt out"} ${c.name}`}>
                              {c.optedOut ? "Opt in" : "Opt out"}
                            </ActionButton>
                            <ActionButton action={deleteCustomer.bind(null, c.id)} variant="ghost" className="text-danger hover:bg-danger-bg hover:text-danger" confirm={`Delete ${c.name} and their message history?`} aria-label={`Delete ${c.name}`}>
                              Delete
                            </ActionButton>
                          </div>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState icon={<Users className="size-5 stroke-[2]" />} title={filtered ? "No matching customers" : "No customers yet"}>
            {filtered ? "Try a different search or filter." : scope.canManage ? "Import your customer list as a CSV to get started." : "Customers will appear here once they're added."}
          </EmptyState>
        )}

        {total > PAGE_SIZE && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
            <span className="tabular">
              {fmtNumber((page - 1) * PAGE_SIZE + 1)}–{fmtNumber(Math.min(page * PAGE_SIZE, total))} of {fmtNumber(total)}
            </span>
            <div className="flex gap-2">
              <Link aria-disabled={page <= 1 || undefined} href={qs({ page: String(page - 1) })} className={buttonClass("secondary", "sm")}>
                <ChevronLeft aria-hidden className="size-4" /> Prev
              </Link>
              <Link aria-disabled={page * PAGE_SIZE >= total || undefined} href={qs({ page: String(page + 1) })} className={buttonClass("secondary", "sm")}>
                Next <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </nav>
        )}
      </Card>
    </>
  );
}
