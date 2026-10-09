import "server-only";
import { createHash } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import type { OrderItem } from "./orders";
import { normalizePhone } from "./phone";

// Google Sheet sync. Staff keep a "Customers" tab and an "Orders" tab in a sheet shared as
// "anyone with the link can view"; each tab's link is saved per client. Columns are found by
// their heading, so their order doesn't matter and extra columns are ignored.

/** Extracts the spreadsheet ID from any Google Sheets link (edit, share, view, export, or bare ID). */
export function extractSheetId(link: string): string | null {
  if (!link) return null;
  const match = link.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (match) return match[1];
  const trimmed = link.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Download link for one tab: by explicit gid or by tab name via gviz/tq. */
export function csvUrl(link: string, sheetName?: string) {
  const id = extractSheetId(link);
  if (!id) return null;
  if (sheetName) {
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }
  const gid = link.match(/[#?&]gid=(\d+)/)?.[1];
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`;
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function fetchTab(link: string, expectedTab?: "Customers" | "Orders") {
  const id = extractSheetId(link);
  if (!id) throw new Error("That doesn't look like a Google Sheets link.");

  const candidates: string[] = [];
  const gidMatch = link.match(/[#?&]gid=(\d+)/)?.[1];

  if (expectedTab === "Customers") {
    // 1. Try named tab "Customers" or "Customer"
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Customers`);
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Customer`);
    // 2. If explicit gid provided, try it
    if (gidMatch) candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gidMatch}`);
    // 3. Fallback to first sheet (gid=0)
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);
  } else if (expectedTab === "Orders") {
    // 1. Try named tab "Orders" or "Order"
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Orders`);
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Order`);
    // 2. If explicit gid provided (and not 0), try it
    if (gidMatch && gidMatch !== "0") {
      candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gidMatch}`);
    }
  } else {
    if (gidMatch) {
      candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gidMatch}`);
    }
    candidates.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);
  }

  const lastError = "Couldn't read the sheet. Set sharing to \"Anyone with the link can view\".";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store", redirect: "follow" });
      if (!res.ok) continue;
      const text = await res.text();
      // Google redirects to login on private sheets
      if (!text || text.includes("<!DOCTYPE html") || text.includes("<html") || text.includes("accounts.google.com")) {
        continue;
      }
      const rows = parseCsv(text);
      if (rows.length === 0) continue;

      if (expectedTab === "Customers") {
        const head = rows[0].map((c) => c.toLowerCase());
        const hasPhone = head.some((c) => /phone|mobile|whatsapp|contact|number|no\.?/.test(c));
        if (hasPhone) return rows;
      } else if (expectedTab === "Orders") {
        const head = rows[0].map((c) => c.toLowerCase());
        const hasItem = head.some((c) => /item|product|qty|quantity|order|price|amount/.test(c));
        if (hasItem) return rows;
      } else {
        return rows;
      }
    } catch {
      // try next candidate
    }
  }

  if (expectedTab === "Customers") {
    throw new Error("Could not find a Customers tab with a Phone column. Make sure the sheet has a Customers tab and sharing is set to 'Anyone with the link can view'.");
  }
  if (expectedTab === "Orders") {
    throw new Error("Could not find an Orders tab with an Item column. Make sure the sheet has an Orders tab and sharing is set to 'Anyone with the link can view'.");
  }
  throw new Error(lastError);
}

/** Finds columns by heading; returns a getter for one row. */
function columns(head: string[], spec: Record<string, RegExp>) {
  const h = head.map((x) => x.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(spec).map(([k, re]) => [k, h.findIndex((x) => re.test(x))]));
  return {
    has: (k: string) => idx[k] >= 0,
    get: (row: string[], k: string) => (idx[k] >= 0 ? (row[idx[k]] ?? "").trim() : ""),
  };
}

const splitTags = (s: string) => s.split(/[,;|]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);
const yes = (s: string) => /^(y|yes|true|1|stop|opted out|unsubscribed)$/i.test(s.trim());
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

/** 25/12/2026, 25-12-2026 (Indian day-first) or 2026-12-25; null when blank or unreadable. */
function parseDate(s: string) {
  const t = s.trim();
  let y: number, m: number, d: number;
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  const ymd = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3]) + (dmy[3].length === 2 ? 2000 : 0)];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return fromZonedTime(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00`, APP_TZ);
}

// Headings are matched loosely but not greedily: "Item name" isn't the customer's name, "Order no" isn't a phone.
const NAME = /^(customer|client)?\s*name$|^customer$/;
const PHONE = /phone|mobile|whatsapp|contact|^(customer\s*)?(number|no\.?)$/;

const CUSTOMER_COLS = {
  name: NAME,
  phone: PHONE,
  area: /area|location|place|city|address/,
  region: /region|zone/,
  tags: /tag|group|segment|category/,
  buys: /buy|bought|purchase|product|item/,
  optout: /opt|stop|unsubscrib/,
};

async function syncCustomers(clientId: string, rows: string[][]) {
  const c = columns(rows[0], CUSTOMER_COLS);
  if (!c.has("phone")) throw new Error("Customers tab: add a column headed \"Phone\".");
  let added = 0, updated = 0, skipped = 0;
  for (const row of rows.slice(1, 20_001)) {
    const phone = normalizePhone(c.get(row, "phone"));
    if (!phone) { skipped++; continue; }
    const name = c.get(row, "name");
    const area = c.get(row, "area");
    const buys = c.get(row, "buys");
    const tags = splitTags(c.get(row, "tags"));
    const existing = await db.customer.findUnique({ where: { clientId_phone: { clientId, phone } }, select: { id: true, tags: true } });
    if (existing) {
      await db.customer.update({
        where: { id: existing.id },
        data: {
          ...(name && { name }),
          ...(area && { location: area }),
          ...(c.get(row, "region") && { region: c.get(row, "region") }),
          ...(buys && { purchases: buys }),
          ...(tags.length && { tags: [...new Set([...existing.tags, ...tags])] }),
          // The sheet can opt someone out, never back in: that needs the customer's own consent.
          ...(yes(c.get(row, "optout")) && { optedOut: true }),
        },
      });
      updated++;
    } else {
      await db.customer.create({
        data: {
          clientId, phone, name: name || `+${phone}`, location: area || null, region: c.get(row, "region") || null,
          purchases: buys || null, tags, optedOut: yes(c.get(row, "optout")),
          optInSource: "Added from Google Sheet", optInAt: new Date(),
        },
      });
      added++;
    }
  }
  return `Customers: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped (no valid phone)` : ""}`;
}

const ORDER_COLS = {
  id: /^(order|bill|invoice|ref)\s*(id|no\.?|number|#)?$/,
  date: /date|day/,
  phone: PHONE,
  name: NAME,
  item: /item|product/,
  qty: /qty|quantity|count|nos/,
  price: /price|rate|each/,
  amount: /amount|total|value/,
  note: /address|note|remark/,
  status: /status|state/,
};

const STATUS_WORDS: Record<string, "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED"> = {
  new: "NEW", confirmed: "CONFIRMED", paid: "PAID", packed: "CONFIRMED", dispatched: "DISPATCHED", shipped: "DISPATCHED", delivered: "DELIVERED", cancelled: "CANCELLED", canceled: "CANCELLED",
};

async function syncOrders(clientId: string, rows: string[][]) {
  const c = columns(rows[0], ORDER_COLS);
  if (!c.has("phone") || !c.has("item")) throw new Error("Orders tab: add columns headed \"Phone\" and \"Item\".");

  // One order can span several rows (one per item): group by order number, else by date + phone.
  const groups = new Map<string, string[][]>();
  for (const row of rows.slice(1, 20_001)) {
    const phone = normalizePhone(c.get(row, "phone"));
    if (!phone || !c.get(row, "item")) continue;
    const key = c.get(row, "id") || `${c.get(row, "date")}|${phone}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let added = 0, known = 0;
  const twoDaysAgo = Date.now() - 2 * 86_400_000;
  for (const [key, group] of groups) {
    const first = group[0];
    const phone = normalizePhone(c.get(first, "phone"))!;
    const items: OrderItem[] = group.map((r, k) => {
      const qty = Math.max(1, Math.round(num(c.get(r, "qty")) || 1));
      const price = c.get(r, "price") ? num(c.get(r, "price")) : num(c.get(r, "amount")) / qty;
      return { id: `sheet-${k + 1}`, name: c.get(r, "item"), quantity: qty, price: Math.round(price * 100) / 100, currency: "INR" };
    });
    // Without an order number, the items are part of the identity so a later order on the same day isn't merged away.
    const ident = c.get(first, "id") ? key : `${key}|${items.map((i) => `${i.quantity}x${i.name}`).join(",")}`;
    const externalRef = `sheet:${clientId}:${createHash("sha1").update(ident).digest("hex").slice(0, 20)}`;
    if (await db.order.findUnique({ where: { externalRef }, select: { id: true } })) { known++; continue; }

    const date = parseDate(c.get(first, "date"));
    const said = STATUS_WORDS[c.get(first, "status").toLowerCase()];
    // Old rows are history (and count for refill reminders); only recent ones need action.
    const status = said ?? (date && date.getTime() < twoDaysAgo ? "DELIVERED" : "NEW");
    const customer =
      (await db.customer.findUnique({ where: { clientId_phone: { clientId, phone } }, select: { id: true } })) ??
      (await db.customer.create({ data: { clientId, phone, name: c.get(first, "name") || `+${phone}`, tags: ["sheet-order"], optInSource: "Added from Google Sheet", optInAt: new Date() }, select: { id: true } }));
    await db.order.create({
      data: {
        clientId, customerId: customer.id, externalRef, items, status,
        total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
        note: group.map((r) => c.get(r, "note")).find(Boolean) || null,
        internalNote: `From Google Sheet${c.get(first, "id") ? ` (order ${c.get(first, "id")})` : ""}`,
        ...(date && { createdAt: date }),
      },
    });
    added++;
  }
  return `Orders: ${added} added${known ? `, ${known} already here` : ""}`;
}

export async function syncSheet(clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { sheetCustomersUrl: true, sheetOrdersUrl: true } });
  if (!client?.sheetCustomersUrl && !client?.sheetOrdersUrl) return null;
  const notes: string[] = [];
  let ok = true;

  const custLink = client.sheetCustomersUrl || client.sheetOrdersUrl;
  const ordLink = client.sheetOrdersUrl || client.sheetCustomersUrl;

  if (custLink) {
    try {
      const rows = await fetchTab(custLink, "Customers");
      notes.push(rows.length > 1 ? await syncCustomers(clientId, rows) : "Customers: tab is empty");
    } catch (e) {
      ok = false;
      notes.push(`Customers: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (ordLink) {
    try {
      const rows = await fetchTab(ordLink, "Orders");
      notes.push(rows.length > 1 ? await syncOrders(clientId, rows) : "Orders: tab is empty");
    } catch (e) {
      // If a single sheet was shared and there is no Orders tab, keep Customers success without error
      if (ordLink === custLink && ok && notes.length > 0) {
        // Orders tab not found is optional
      } else {
        ok = false;
        notes.push(`Orders: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const note = notes.join(" · ") || "Synced";
  await db.client.update({ where: { id: clientId }, data: { sheetSyncedAt: new Date(), sheetSyncNote: note } });
  return { ok, note };
}

/** Called by the scheduler: syncs sheets not synced in the last 30 minutes, a couple per call. */
export async function syncDueSheets(now = new Date()) {
  const due = await db.client.findMany({
    where: {
      OR: [{ sheetCustomersUrl: { not: null } }, { sheetOrdersUrl: { not: null } }],
      AND: [{ OR: [{ sheetSyncedAt: null }, { sheetSyncedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }] }],
    },
    select: { id: true },
    take: 2,
  });
  for (const c of due) await syncSheet(c.id).catch((e) => console.error(`Sheet sync failed for ${c.id}`, e));
}
