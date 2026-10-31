// The live sync from Thabaal to a business's own Google Sheet.
//
// How it stays live: whenever something happens (a message, an order step, a payment) the change is picked up a
// moment later by `kickSheetSync`, which runs after the response has gone, so nobody waits. The scheduler's run
// (lib/dispatcher.ts) catches anything missed, e.g. when Google was slow. Each tab remembers how far it has got
// (a cursor of time + id), so nothing is skipped and nothing is written twice; one sync runs at a time per business.
//
// Customers, Addresses, Orders and Order Items are kept up to date in place (found by their key in column A);
// Payments, Chats and Activity only ever grow. Thabaal's database stays the source of truth: the sheet is a copy
// the owner can read, filter and share, and edits made in it are not read back.
import "server-only";
import { after } from "next/server";
import { formAddressText, type DeliveryAddress } from "../address-form";
import { db } from "../db";
import { orderRef } from "../orders";
import { orderStage, readFlow, stepLabel } from "../order-flow";
import { dueOf, methodLabel, methodOf, paymentState, receivedOf, SOURCE_LABEL, STATE_LABEL } from "../payment-state";
import { isSale, SALE_WHERE } from "../sale";
import { seal, unseal } from "../secret-box";
import { appendRows, clearData, createSpreadsheet, GoogleError, readKeys, refreshAccess, revoke, sheetExists, writeRanges, rangeOf, colLetter } from "./google";
import {
  activityRow,
  addressId,
  addressRow,
  chatRow,
  customerRow,
  itemRows,
  orderRow,
  paymentRow,
  summaryGrid,
  tabOf,
  type AddressIn,
  type Cell,
  type OrderIn,
  type OrderItemIn,
  type TabKey,
} from "./layout";

type Cursor = { at: string; id: string };
type Stream = "customers" | "orders" | "chatsIn" | "chatsOut" | "payments" | "activity";
type Cursors = Partial<Record<Stream, Cursor>>;

const BATCH = 250;
const LOCK_MS = 2 * 60_000;
const SUMMARY_EVERY_MS = 60_000;

/* ---------- access ---------- */

const tokens = new Map<string, { token: string; until: number }>();

async function accessFor(link: { clientId: string; refreshToken: string | null }) {
  const hit = tokens.get(link.clientId);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const refresh = unseal(link.refreshToken);
  if (!refresh) throw new GoogleError("Google access is missing. Connect Google Sheets again.", 401, "auth");
  const r = await refreshAccess(refresh);
  tokens.set(link.clientId, { token: r.accessToken, until: Date.now() + r.expiresIn * 1000 });
  return r.accessToken;
}

/* ---------- connect / disconnect ---------- */

/**
 * After the owner allowed access: keeps the (encrypted) refresh token and makes the sheet, or keeps using the one
 * already made for this business when it still exists. The first sync then fills it with everything so far.
 */
export async function connectSheet(p: { clientId: string; refreshToken: string; accessToken: string; expiresIn: number; email: string | null; by: string }) {
  tokens.set(p.clientId, { token: p.accessToken, until: Date.now() + p.expiresIn * 1000 });
  const [client, old] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: p.clientId }, select: { name: true } }),
    db.sheetLink.findUnique({ where: { clientId: p.clientId } }),
  ]);
  let spreadsheetId = old?.spreadsheetId ?? null;
  let tabs = old?.tabs ?? null;
  let fresh = false;
  if (!spreadsheetId || !(await sheetExists(p.accessToken, spreadsheetId).catch(() => false))) {
    const made = await createSpreadsheet(p.accessToken, `${client.name} · Thabaal`);
    spreadsheetId = made.spreadsheetId;
    tabs = made.tabs;
    fresh = true;
  }
  const data = {
    googleEmail: p.email,
    refreshToken: seal(p.refreshToken) ?? null,
    spreadsheetId,
    tabs: tabs ?? undefined,
    status: "connected",
    lastError: null,
    lockUntil: null,
    connectedBy: p.by,
    ...(fresh ? { cursors: {}, syncedAt: null, summaryAt: null } : {}),
  };
  await db.sheetLink.upsert({ where: { clientId: p.clientId }, update: data, create: { clientId: p.clientId, ...data, cursors: {} } });
  return { spreadsheetId, fresh };
}

/** Stops the sync and removes Thabaal's access from the Google account. The sheet stays the owner's. */
export async function disconnectSheet(clientId: string) {
  const link = await db.sheetLink.findUnique({ where: { clientId } });
  if (!link) return;
  const refresh = unseal(link.refreshToken);
  if (refresh) await revoke(refresh);
  tokens.delete(clientId);
  await db.sheetLink.update({ where: { clientId }, data: { status: "off", refreshToken: null, lockUntil: null, dirty: false } });
  await db.sheetLog.deleteMany({ where: { clientId } });
}

/** Empties the sheet and writes everything again from the start (Settings → Rebuild). */
export async function rebuildSheet(clientId: string) {
  const link = await db.sheetLink.findUnique({ where: { clientId } });
  if (!link?.spreadsheetId || link.status !== "connected") return;
  const token = await accessFor(link);
  await clearData(token, link.spreadsheetId);
  await db.sheetLink.update({ where: { clientId }, data: { cursors: {}, syncedAt: null, summaryAt: null } });
}

/* ---------- activity ---------- */

/** A line for the Activity tab, kept only while the business has a sheet connected. */
export async function logSheetActivity(
  clientId: string | null | undefined,
  e: { event: string; details?: string | null; phone?: string | null; customer?: string | null; orderRef?: string | null; by?: string | null },
) {
  if (!clientId) return false;
  const on = await db.sheetLink.findFirst({ where: { clientId, status: "connected" }, select: { id: true } }).catch(() => null);
  if (!on) return false;
  await db.sheetLog
    .create({
      data: {
        clientId,
        event: e.event.slice(0, 200),
        details: e.details?.slice(0, 400) ?? null,
        phone: e.phone ?? null,
        customer: e.customer ?? null,
        orderRef: e.orderRef ?? null,
        by: e.by ?? null,
      },
    })
    .catch(() => {});
  return true;
}

/** Runs a sync for this business after the response has gone (or right away outside a request). */
export function kickSheetSync(clientId: string | null | undefined) {
  if (!clientId) return;
  const job = () => syncClientSheet(clientId, 20_000).then(() => {}, (e) => console.warn("[gsheet] sync failed", e));
  try {
    after(job);
  } catch {
    void job();
  }
}

/* ---------- reading changes ---------- */

const since = (c: Cursor | undefined, field: string) =>
  c ? { OR: [{ [field]: { gt: new Date(c.at) } }, { [field]: new Date(c.at), id: { gt: c.id } }] } : {};
/** The cursor after the last row read: its time and id. */
function next<T extends { id: string }>(rows: T[], at: (r: T) => Date): Cursor | undefined {
  const last = rows[rows.length - 1];
  return last ? { at: at(last).toISOString(), id: last.id } : undefined;
}

type OrderRow = Awaited<ReturnType<typeof loadOrders>>[number];
function loadOrders(where: object, take?: number) {
  return db.order.findMany({
    where,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take,
    include: { customer: { select: { name: true, phone: true, locationRaw: true, deliveryAddress: true } } },
  });
}

const savedAddress = (c: { locationRaw: string | null; deliveryAddress: unknown }) => {
  const d = (c.deliveryAddress && typeof c.deliveryAddress === "object" ? c.deliveryAddress : null) as DeliveryAddress | null;
  return { text: c.locationRaw?.trim() || (d ? formAddressText(d) : "") || null, mapUrl: d?.mapUrl ?? null };
};

function orderIn(o: OrderRow, flow: ReturnType<typeof readFlow>): OrderIn {
  const stage = orderStage(o);
  const saved = savedAddress(o.customer);
  return {
    ref: orderRef(o),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    customer: o.customer.name,
    phone: o.customer.phone,
    items: (Array.isArray(o.items) ? o.items : []) as OrderItemIn[],
    total: o.total,
    paid: receivedOf(o),
    due: dueOf(o),
    method: methodOf(o) ? methodLabel(methodOf(o)) : "Not chosen yet",
    payStatus: STATE_LABEL[paymentState(o)],
    status: stage === "CANCELLED" ? "Cancelled" : (stepLabel(flow, stage) ?? stage),
    address: (o.addressConfirmedAt ? o.note : null) ?? saved.text,
    mapUrl: o.mapUrl ?? saved.mapUrl,
    deliveredAt: o.deliveredAt,
    source: o.externalRef ? "Google Sheet import" : o.waMessageId ? "WhatsApp cart" : "Added by staff",
  };
}

const KIND: Record<string, string> = { text: "Text", button: "Button", media: "Media", order: "Cart", location: "Location" };
const byOf = (m: { templateName: string; runId: string | null; templateId: string | null }) =>
  ["Typed reply", "Media reply"].includes(m.templateName) ? "Staff" : m.runId ? "Campaign" : m.templateId ? `Template: ${m.templateName}` : `Auto: ${m.templateName}`;

/* ---------- one sync ---------- */

type Link = NonNullable<Awaited<ReturnType<typeof db.sheetLink.findUnique>>>;

/** Upserts rows into a keyed tab: rows whose key is already in column A are rewritten, the rest are added. */
function plan(keys: string[], rows: { key: string; row: Cell[] }[], tabKey: TabKey) {
  const tab = tabOf(tabKey);
  const at = new Map(keys.map((k, i) => [k, i + 2]));
  const updates: { range: string; values: Cell[][] }[] = [];
  const adds: Cell[][] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.key)) continue; // the newest copy is first; older duplicates in this batch are skipped
    seen.add(r.key);
    const n = at.get(r.key);
    if (n) updates.push({ range: rangeOf(tab, `A${n}`, `${colLetter(tab.cols.length - 1)}${n}`), values: [r.row] });
    else adds.push(r.row);
  }
  return { tab, updates, adds };
}

/** One pass: up to BATCH changes per stream. Returns true when any stream still has more waiting. */
async function pass(link: Link, token: string): Promise<boolean> {
  const clientId = link.clientId;
  const spreadsheetId = link.spreadsheetId!;
  const cur = { ...((link.cursors as Cursors | null) ?? {}) };
  const client = await db.client.findUniqueOrThrow({ where: { id: clientId }, select: { orderFlow: true } });
  const flow = readFlow(client.orderFlow);

  const [orders, custs, repliesIn, msgsOut, pays, logs] = await Promise.all([
    loadOrders({ clientId, ...since(cur.orders, "updatedAt") }, BATCH),
    db.customer.findMany({ where: { clientId, ...since(cur.customers, "updatedAt") }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: BATCH, select: { id: true, updatedAt: true } }),
    db.reply.findMany({
      where: { customer: { clientId }, ...since(cur.chatsIn, "receivedAt") },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: BATCH,
      include: { customer: { select: { name: true, phone: true } } },
    }),
    db.message.findMany({
      where: { customer: { clientId }, simulated: false, ...since(cur.chatsOut, "createdAt") },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      include: { customer: { select: { name: true, phone: true } } },
    }),
    db.paymentEvent.findMany({
      where: { clientId, orderId: { not: null }, ...since(cur.payments, "createdAt") },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      include: { order: { select: { ref: true, number: true, customer: { select: { name: true, phone: true } } } } },
    }),
    db.sheetLog.findMany({ where: { clientId, ...since(cur.activity, "at") }, orderBy: [{ at: "asc" }, { id: "asc" }], take: BATCH }),
  ]);

  // Customers whose row (or addresses) may have changed: edited themselves, or one of their orders changed.
  const custIds = [...new Set([...custs.map((c) => c.id), ...orders.map((o) => o.customerId)])];
  const people = custIds.length
    ? await db.customer.findMany({
        where: { id: { in: custIds } },
        select: {
          id: true,
          name: true,
          phone: true,
          location: true,
          region: true,
          locationRaw: true,
          deliveryAddress: true,
          tags: true,
          optInSource: true,
          optedOut: true,
          unreachable: true,
          createdAt: true,
          orders: {
            select: { createdAt: true, total: true, status: true, paidAt: true, paymentMethod: true, internalNote: true, note: true, addressConfirmedAt: true, mapUrl: true },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : [];
  const lastMsg = custIds.length ? await db.reply.groupBy({ by: ["customerId"], where: { customerId: { in: custIds } }, _max: { receivedAt: true } }) : [];

  const customerRows: { key: string; row: Cell[] }[] = [];
  const addressRows: { key: string; row: Cell[] }[] = [];
  for (const p of people) {
    const sales = p.orders.filter(isSale);
    const saved = savedAddress(p);
    const row = customerRow({
      phone: p.phone,
      name: p.name,
      area: p.location ?? p.region,
      address: saved.text,
      mapUrl: saved.mapUrl,
      orders: sales.length,
      spent: sales.reduce((s, o) => s + o.total, 0),
      firstOrder: sales[0]?.createdAt ?? null,
      lastOrder: sales[sales.length - 1]?.createdAt ?? null,
      lastMessage: lastMsg.find((m) => m.customerId === p.id)?._max.receivedAt ?? null,
      since: p.createdAt,
      tags: p.tags,
      cameFrom: p.optInSource ?? p.tags.find((g) => g.startsWith("src:"))?.slice(4) ?? null,
      optedOut: p.optedOut,
      unreachable: p.unreachable,
    });
    customerRows.push({ key: String(row[0]), row });

    // Every address they've had an order delivered to, and the one saved now.
    const byId = new Map<string, AddressIn>();
    for (const o of p.orders) {
      if (!o.addressConfirmedAt || !o.note?.trim() || o.status === "CANCELLED") continue;
      const id = addressId(p.phone, o.note);
      const a = byId.get(id) ?? { phone: p.phone, name: p.name, address: o.note.trim(), area: p.location ?? p.region, mapUrl: null, orders: 0, first: o.createdAt, last: o.createdAt };
      a.orders += 1;
      a.last = o.createdAt;
      a.mapUrl = o.mapUrl ?? a.mapUrl;
      byId.set(id, a);
    }
    if (saved.text && !byId.has(addressId(p.phone, saved.text)))
      byId.set(addressId(p.phone, saved.text), { phone: p.phone, name: p.name, address: saved.text, area: p.location ?? p.region, mapUrl: saved.mapUrl, orders: 0, first: null, last: null });
    for (const [id, a] of byId) addressRows.push({ key: id, row: addressRow(a) });
  }

  // Orders (newest copy first, so a later change in the same batch wins) and their item lines.
  const orderRows: { key: string; row: Cell[] }[] = [];
  const ordersIn = [...orders].reverse().map((o) => orderIn(o, flow));
  for (const x of ordersIn) orderRows.push({ key: x.ref, row: orderRow(x) });

  const keyed = (["customers", "addresses", "orders", "items"] as TabKey[]).filter((k) =>
    k === "customers" ? customerRows.length : k === "addresses" ? addressRows.length : orders.length,
  );
  const keys = await readKeys(token, spreadsheetId, keyed.map(tabOf));
  const itemKeys = keys.get("items") ?? [];
  const lineRows = ordersIn.flatMap((x) => itemRows(x, itemKeys.filter((k) => k.startsWith(`${x.ref} #`)).length));

  const plans = [
    plan(keys.get("customers") ?? [], customerRows, "customers"),
    plan(keys.get("addresses") ?? [], addressRows, "addresses"),
    plan(keys.get("orders") ?? [], orderRows, "orders"),
    plan(itemKeys, lineRows, "items"),
  ];
  await writeRanges(token, spreadsheetId, plans.flatMap((p) => p.updates));
  for (const p of plans) await appendRows(token, spreadsheetId, p.tab, p.adds);

  // The logs: chats both ways in time order, payments, activity.
  const chats = [
    ...repliesIn.map((r) => ({ at: r.receivedAt, row: chatRow({ at: r.receivedAt, phone: r.customer.phone, customer: r.customer.name, incoming: true, type: KIND[r.kind] ?? (r.mediaType || "Media"), text: r.text, by: "Customer" }) })),
    ...msgsOut.map((m) => ({
      at: m.createdAt,
      row: chatRow({ at: m.createdAt, phone: m.customer.phone, customer: m.customer.name, incoming: false, type: m.templateId ? "Template" : "Text", text: m.body ?? m.templateName, by: byOf(m) }),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  await appendRows(token, spreadsheetId, tabOf("chats"), chats.map((c) => c.row));
  await appendRows(
    token,
    spreadsheetId,
    tabOf("payments"),
    pays.map((e) =>
      paymentRow({
        at: e.createdAt,
        ref: e.order ? orderRef(e.order) : "",
        customer: e.order?.customer.name ?? "",
        phone: e.order?.customer.phone ?? "",
        refund: /refund/i.test(`${e.status} ${e.source}`),
        via: SOURCE_LABEL[e.source] ? `WhatsApp · ${SOURCE_LABEL[e.source]}` : e.source.replace(/_/g, " "),
        amount: e.amount,
        reference: e.utr ?? e.transactionId,
        result: e.status.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase()),
        note: e.note,
      }),
    ),
  );
  await appendRows(token, spreadsheetId, tabOf("activity"), logs.map((l) => activityRow(l)));

  // Everything written: move the cursors on.
  const moved: Cursors = {
    ...cur,
    ...(orders.length ? { orders: next(orders, (r) => r.updatedAt) } : {}),
    ...(custs.length ? { customers: next(custs, (r) => r.updatedAt) } : {}),
    ...(repliesIn.length ? { chatsIn: next(repliesIn, (r) => r.receivedAt) } : {}),
    ...(msgsOut.length ? { chatsOut: next(msgsOut, (r) => r.createdAt) } : {}),
    ...(pays.length ? { payments: next(pays, (r) => r.createdAt) } : {}),
    ...(logs.length ? { activity: next(logs, (r) => r.at) } : {}),
  };
  const wrote = orders.length + custs.length + repliesIn.length + msgsOut.length + pays.length + logs.length > 0;
  await db.sheetLink.update({ where: { clientId }, data: { cursors: moved, ...(wrote ? { syncedAt: new Date() } : {}) } });
  link.cursors = moved;
  if (logs.length) await db.sheetLog.deleteMany({ where: { clientId, id: { in: logs.map((l) => l.id) } } }).catch(() => {});
  return [orders, custs, repliesIn, msgsOut, pays, logs].some((r) => r.length >= BATCH);
}

/* ---------- summary ---------- */

const IST = "Asia/Kolkata";
const istStart = (d: Date, unit: "day" | "month") => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [y, m, dd] = p.split("-");
  return new Date(`${y}-${m}-${unit === "day" ? dd : "01"}T00:00:00+05:30`);
};

async function writeSummary(clientId: string, token: string, spreadsheetId: string, now = new Date()) {
  const day = istStart(now, "day");
  const month = istStart(now, "month");
  const sale = { clientId, ...SALE_WHERE };
  const [client, today, todayNew, todayChats, mon, monOnline, monCod, monNew, carts, toSend, cod, customers, allOrders, allSales, monthOrders, top] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
    db.order.aggregate({ where: { ...sale, createdAt: { gte: day } }, _count: true, _sum: { total: true } }),
    db.customer.count({ where: { clientId, createdAt: { gte: day } } }),
    db.reply.count({ where: { customer: { clientId }, receivedAt: { gte: day } } }),
    db.order.aggregate({ where: { ...sale, createdAt: { gte: month } }, _count: true, _sum: { total: true } }),
    db.order.aggregate({ where: { clientId, createdAt: { gte: month }, paidAt: { not: null }, NOT: { paymentMethod: { in: ["cod", "cash"] } } }, _sum: { total: true } }),
    db.order.aggregate({ where: { ...sale, createdAt: { gte: month }, paymentMethod: "cod" }, _sum: { total: true } }),
    db.customer.count({ where: { clientId, createdAt: { gte: month } } }),
    db.order.aggregate({ where: { clientId, status: "NEW", paidAt: null, OR: [{ paymentMethod: null }, { paymentMethod: { not: "cod" } }] }, _count: true, _sum: { total: true } }),
    db.order.count({ where: { ...sale, status: { in: ["CONFIRMED", "PAID"] }, dispatchedAt: null } }),
    db.order.findMany({ where: { clientId, status: "DISPATCHED", paymentMethod: "cod", paidAt: null }, select: { total: true, paidAmount: true } }),
    db.customer.count({ where: { clientId } }),
    db.order.count({ where: { clientId, status: { not: "CANCELLED" } } }),
    db.order.aggregate({ where: sale, _sum: { total: true } }),
    db.order.findMany({ where: { ...sale, createdAt: { gte: month } }, select: { items: true }, take: 3000 }),
    db.order.groupBy({ by: ["customerId"], where: sale, _sum: { total: true }, _count: true, orderBy: { _sum: { total: "desc" } }, take: 5 }),
  ]);
  const products = new Map<string, { name: string; qty: number; sales: number }>();
  for (const o of monthOrders)
    for (const i of (Array.isArray(o.items) ? o.items : []) as OrderItemIn[]) {
      const name = String(i.name ?? i.id ?? "Item").trim();
      const qty = Number(i.quantity) || 1;
      const p = products.get(name) ?? { name, qty: 0, sales: 0 };
      p.qty += qty;
      p.sales += qty * (Number(i.price) || 0);
      products.set(name, p);
    }
  const who = await db.customer.findMany({ where: { id: { in: top.map((x) => x.customerId) } }, select: { id: true, name: true, phone: true } });
  const grid = summaryGrid({
    shop: client.name,
    updated: now,
    today: { orders: today._count, sales: today._sum.total ?? 0, newCustomers: todayNew, chats: todayChats },
    month: {
      label: new Intl.DateTimeFormat("en-IN", { timeZone: IST, month: "long", year: "numeric" }).format(now),
      orders: mon._count,
      sales: mon._sum.total ?? 0,
      online: monOnline._sum.total ?? 0,
      cod: monCod._sum.total ?? 0,
      newCustomers: monNew,
    },
    waiting: {
      carts: carts._count,
      cartValue: carts._sum.total ?? 0,
      toDispatch: toSend,
      codOrders: cod.length,
      codToCollect: cod.reduce((s, o) => s + Math.max(0, o.total - (o.paidAmount ?? 0)), 0),
    },
    allTime: { customers, orders: allOrders, sales: allSales._sum.total ?? 0 },
    topProducts: [...products.values()].sort((a, b) => b.sales - a.sales || b.qty - a.qty).slice(0, 5),
    topCustomers: top.map((x) => {
      const c = who.find((w) => w.id === x.customerId);
      return { name: c?.name ?? "-", phone: c?.phone ?? "", orders: x._count, spent: x._sum.total ?? 0 };
    }),
  });
  const tab = tabOf("summary");
  await writeRanges(token, spreadsheetId, [{ range: rangeOf(tab, "A1", `F${grid.length}`), values: grid }]);
  await db.sheetLink.update({ where: { clientId }, data: { summaryAt: now } });
}

/* ---------- the sync ---------- */

/** Explains a Google failure to the owner and decides whether the sync can carry on later by itself. */
async function noteFailure(clientId: string, e: unknown) {
  const g = e instanceof GoogleError ? e : null;
  const message =
    g?.kind === "auth"
      ? "Google access was removed or has expired. Press Connect Google Sheets again."
      : g?.kind === "gone"
        ? "The sheet was deleted or Thabaal can no longer open it. Press Connect Google Sheets again to make a new one."
        : g?.kind === "limit"
          ? "Google asked us to slow down; the sheet catches up by itself in a minute."
          : `The last update didn't go through (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}). It retries by itself.`;
  if (g?.kind === "auth" || g?.kind === "gone") tokens.delete(clientId);
  await db.sheetLink
    .update({ where: { clientId }, data: { lastError: message, lockUntil: null, ...(g?.kind === "auth" || g?.kind === "gone" ? { status: "error" } : {}) } })
    .catch(() => {});
}

/**
 * Brings one business's sheet up to date (within `budgetMs`). Only one runs at a time per business; a change that
 * arrives meanwhile marks the link dirty, and the running sync goes round once more.
 */
export async function syncClientSheet(clientId: string, budgetMs = 40_000): Promise<{ ran: boolean; more?: boolean }> {
  const start = Date.now();
  const now = new Date();
  const got = await db.sheetLink.updateMany({
    where: { clientId, status: "connected", spreadsheetId: { not: null }, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] },
    data: { lockUntil: new Date(now.getTime() + LOCK_MS), dirty: false },
  });
  if (!got.count) {
    await db.sheetLink.updateMany({ where: { clientId, status: "connected" }, data: { dirty: true } }).catch(() => {});
    return { ran: false };
  }
  let more = false;
  try {
    for (;;) {
      const link = await db.sheetLink.findUniqueOrThrow({ where: { clientId } });
      const token = await accessFor(link);
      more = await pass(link, token);
      while (more && Date.now() - start < budgetMs) more = await pass(link, token);
      const fresh = await db.sheetLink.findUniqueOrThrow({ where: { clientId }, select: { summaryAt: true, dirty: true, syncedAt: true } });
      const stale = !fresh.summaryAt || Date.now() - fresh.summaryAt.getTime() > SUMMARY_EVERY_MS || (fresh.syncedAt && fresh.syncedAt > fresh.summaryAt);
      if (!more && stale && Date.now() - start < budgetMs) await writeSummary(clientId, token, link.spreadsheetId!);
      if (!fresh.dirty || more || Date.now() - start > budgetMs) break;
      await db.sheetLink.update({ where: { clientId }, data: { dirty: false } });
    }
    await db.sheetLink.update({ where: { clientId }, data: { lockUntil: null, lastError: null, ...(more ? { dirty: true } : {}) } });
    return { ran: true, more };
  } catch (e) {
    await noteFailure(clientId, e);
    return { ran: true, more: true };
  }
}

/** The scheduler's catch-up: every connected sheet with something waiting, a few at a time. */
export async function syncAllSheets(deadline: number) {
  const links = await db.sheetLink.findMany({ where: { status: "connected", spreadsheetId: { not: null } }, select: { clientId: true }, orderBy: { syncedAt: "asc" } });
  for (const l of links) {
    if (Date.now() > deadline - 5_000) break;
    await syncClientSheet(l.clientId, Math.min(25_000, deadline - Date.now() - 3_000)).catch((e) => console.warn("[gsheet] scheduled sync failed", e));
  }
}

/** For the Settings card: is a sheet connected, and how is it doing. Never returns the token. */
export async function sheetLinkView(clientId: string) {
  const l = await db.sheetLink.findUnique({
    where: { clientId },
    select: { status: true, googleEmail: true, spreadsheetId: true, syncedAt: true, lastError: true, cursors: true },
  });
  if (!l || l.status === "off" || !l.spreadsheetId) return null;
  const pending = await db.sheetLog.count({ where: { clientId } });
  return { status: l.status as "connected" | "error", email: l.googleEmail, spreadsheetId: l.spreadsheetId, syncedAt: l.syncedAt, lastError: l.lastError, filling: !l.syncedAt, pending };
}
