import { cookies } from "next/headers";
import { readFields, readValues } from "@/lib/custom-fields";
import { NextResponse, type NextRequest } from "next/server";
import { customerFilters, customerWhere } from "@/lib/customer-query";
import { db } from "@/lib/db";
import { customerSegmentIds } from "@/lib/filter-scope";
import { keepFilters, readFilters, resolvePeriod } from "@/lib/filters";
import { fmtDate } from "@/lib/format";
import { getScope, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

/**
 * The customers listed on the Customers page (same search and filters) as a CSV, for Excel or
 * Google Sheets. Managers and admins only: it's the business's whole contact list.
 */
export async function GET(req: NextRequest) {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();
  // Unpaid business: closed until the plan payment is verified (lib/plan-access.ts).
  if (scope.planLocked) return new NextResponse("thabaal is paused until your plan payment is verified.", { status: 403 });
  if (!scope.canManage) return new NextResponse("Only managers can export customers.", { status: 403 });

  const params: Record<string, string | string[]> = {};
  for (const [k, v] of req.nextUrl.searchParams) params[k] = k in params ? [...[params[k]].flat(), v] : v;
  const filters = keepFilters(readFilters(params, "all"), ["period", "products"]);
  const period = resolvePeriod(filters);
  const stage = typeof params.stage === "string" ? params.stage : "";
  const act = typeof params.act === "string" ? params.act : "";
  const segment = scope.clientId
    ? await customerSegmentIds(scope.clientId, filters, { stage, act, ...(filters.range !== "all" && { start: period.start, end: period.end }) })
    : null;
  const where = { ...(await customerWhere(scope, customerFilters(params))), ...(segment && { id: { in: segment } }) };
  const customers = await db.customer.findMany({
    where,
    include: {
      client: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50_000,
  });

  // Orders per customer, not counting cancelled ones.
  const ids = customers.map((c) => c.id);
  const orders = ids.length
    ? await db.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { not: "CANCELLED" } }, _count: true, _sum: { total: true }, _max: { createdAt: true } })
    : [];
  const orderOf = new Map(orders.map((o) => [o.customerId, o]));

  // Excel would run cells starting with = + - @ as formulas; a leading apostrophe keeps them as text.
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  // "91 98765 43210": Excel keeps it as text (not 9.19877E+11), and Import CSV reads it back.
  const phone = (digits: string) => (digits.startsWith("91") && digits.length === 12 ? `91 ${digits.slice(2, 7)} ${digits.slice(7)}` : digits.replace(/^(\d{1,3})(\d+)$/, "$1 $2"));
  const date = (d: Date | null | undefined) => (d ? fmtDate(d, "d MMM yyyy") : "");

  // The client's custom customer fields become extra columns (one client picked only).
  const fields = scope.clientId
    ? readFields((await db.client.findUnique({ where: { id: scope.clientId }, select: { customFields: true } }))?.customFields, "customer")
    : [];
  const header = [
    "Name", "Phone", ...(scope.clientId ? [] : ["Client"]), "Area", "Region", "Tags", "Bought", "Orders", "Spent (₹)", "Last order",
    "Last message", "Last message status", "Opted out", "Can't receive WhatsApp", "Agreed to messages", "Agreed on", "Added on",
    ...fields.map((f) => f.label),
  ];
  const lines = [
    header.map(cell).join(","),
    ...customers.map((c) => {
      const o = orderOf.get(c.id);
      const last = c.messages[0];
      return [
        c.name, phone(c.phone), ...(scope.clientId ? [] : [c.client.name]), c.location, c.region, c.tags.join(", "), c.purchases,
        o?._count ?? 0, o?._sum.total != null ? Math.round(o._sum.total * 100) / 100 : 0, date(o?._max.createdAt),
        date(last?.createdAt), last?.status.toLowerCase(), c.optedOut ? "yes" : "no", c.unreachable ? "yes" : "no",
        c.optInSource, date(c.optInAt), date(c.createdAt),
        ...fields.map((f) => readValues(c.extra)[f.key] ?? ""),
      ].map(cell).join(",");
    }),
  ];

  const who = (scope.clientName ?? "all-clients").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // The byte-order mark makes Excel read the file as UTF-8, so Tamil names come out right.
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${who}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
