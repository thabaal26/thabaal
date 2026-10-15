"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { defaultRegion, homeCityOf, regionsFor } from "@/lib/regions";
import { cleanValues, readFields, readValues } from "@/lib/custom-fields";
import { owned, requireManager } from "@/lib/session";
import type { ActionResult } from "./templates";

const parseTags = (s: string) => [...new Set(s.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

export type CustomerInput = {
  name: string;
  phone: string;
  tags: string;
  optInSource?: string;
  location?: string;
  locationRaw?: string;
  region?: string;
  purchases?: string;
  /** Custom field values by key (lib/custom-fields.ts). */
  extra?: Record<string, string>;
};

/** The region to save: one of the client's three, or the default when an area was typed without one. */
async function regionToSave(clientId: string, picked: string | undefined, location: string | null | undefined) {
  const city = homeCityOf(await db.client.findUnique({ where: { id: clientId }, select: { homeCity: true } }));
  if (picked && regionsFor(city).includes(picked)) return picked;
  return location ? defaultRegion(city) : null;
}

export async function saveCustomer(id: string | null, input: CustomerInput): Promise<ActionResult> {
  const s = id ? await requireManager() : await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = id ? await db.customer.findFirst({ where: { id, ...owned(s) } }) : null;
  if (id && !existing) return { ok: false, message: "Customer not found." };
  const clientId = existing?.clientId ?? s.clientId!;

  const phone = normalizePhone(input.phone);
  if (!input.name.trim()) return { ok: false, message: "Enter the customer's name." };
  if (!phone) return { ok: false, message: "Enter a valid mobile number with country code." };
  const clash = await db.customer.findUnique({ where: { clientId_phone: { clientId, phone } } });
  if (clash && clash.id !== id) return { ok: false, message: `+${phone} already belongs to ${clash.name}.` };

  const location = input.location !== undefined ? (input.location.trim() || null) : undefined;
  const locationRaw = input.locationRaw !== undefined ? (input.locationRaw.trim() || null) : undefined;
  const region = input.region !== undefined ? await regionToSave(clientId, input.region, location) : undefined;
  const purchases = input.purchases !== undefined ? (input.purchases.trim() || null) : undefined;

  // Custom fields: check the typed values; values of fields no longer shown are kept.
  let extra: Record<string, string> | undefined;
  if (input.extra !== undefined) {
    const fields = readFields((await db.client.findUnique({ where: { id: clientId }, select: { customFields: true } }))?.customFields, "customer");
    const checked = cleanValues(fields, input.extra);
    if ("error" in checked) return { ok: false, message: checked.error };
    const kept = Object.fromEntries(Object.entries(readValues(existing?.extra)).filter(([k]) => !fields.some((f) => f.key === k)));
    extra = { ...kept, ...checked.values };
  }

  const existingLoyaltyTags = (existing?.tags ?? []).filter((t) => t.trim().toLowerCase().startsWith("loyalty-bonus:"));
  const data = {
    name: input.name.trim(),
    phone,
    tags: [...new Set([...parseTags(input.tags), ...existingLoyaltyTags])],
    ...(location !== undefined && { location }),
    ...(locationRaw !== undefined && { locationRaw }),
    ...(region !== undefined && { region }),
    ...(purchases !== undefined && { purchases }),
    ...(extra !== undefined && { extra }),
  };

  if (id) {
    await db.customer.update({ where: { id }, data });
    revalidatePath(`/dashboard/customers/${id}`);
  } else {
    if (!input.optInSource?.trim()) return { ok: false, message: "Note how the customer agreed to WhatsApp messages; Meta requires it." };
    await db.customer.create({ data: { ...data, clientId, optInSource: input.optInSource.trim(), optInAt: new Date() } });
  }
  revalidatePath("/dashboard/customers");
  return { ok: true, message: id ? "Customer details updated." : "Customer added." };
}

/** Promotes a PendingCustomer (from transcribed paper order sheets) into an active Customer once their phone number is verified. */
export async function promotePendingCustomer(
  pendingId: string,
  input: { name: string; phone: string; location?: string; region?: string; purchases?: string; optInSource?: string },
): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const row = await db.pendingCustomer.findFirst({ where: { id: pendingId, ...owned(s) } });
  if (!row) return { ok: false, message: "Pending entry not found." };

  const phone = normalizePhone(input.phone);
  if (!input.name.trim() || input.name.trim() === "(name unclear)") {
    return { ok: false, message: "Enter the customer's name before adding them." };
  }
  if (!phone) return { ok: false, message: "Enter a valid 10-digit mobile number (or number with country code)." };

  const location = input.location?.trim() || row.location || null;
  const region = await regionToSave(row.clientId, input.region, location);
  const purchases = input.purchases?.trim() || row.items || null;
  const optInSource = input.optInSource?.trim() || "Bought from us and gave their number";

  await db.$transaction([
    db.customer.upsert({
      where: { clientId_phone: { clientId: row.clientId, phone } },
      update: {
        name: input.name.trim(),
        ...(location && { location }),
        ...(region && { region }),
        ...(purchases && { purchases }),
      },
      create: {
        clientId: row.clientId,
        name: input.name.trim(),
        phone,
        location,
        region,
        purchases,
        tags: [],
        optInSource,
        optInAt: new Date(),
      },
    }),
    db.pendingCustomer.delete({ where: { id: row.id } }),
  ]);

  revalidatePath("/dashboard/customers");
  return { ok: true, message: `${input.name.trim()} added to customer directory.` };
}

export async function deletePendingCustomer(pendingId: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.pendingCustomer.deleteMany({ where: { id: pendingId, ...owned(s) } });
  if (!r.count) return { ok: false, message: "Pending entry not found." };
  revalidatePath("/dashboard/customers");
  return { ok: true, message: "Pending entry dismissed." };
}

/** Splits one CSV line, honouring double quotes. */
function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && q) { cur += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export async function importCustomers(csv: string, extraTags: string, optInSource = ""): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!optInSource.trim()) return { ok: false, message: "Note how these customers agreed to WhatsApp messages; Meta requires it." };
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { ok: false, message: "The file is empty." };

  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /name|phone|mobile|number|whatsapp/.test(h));
  const col = (re: RegExp, fallback: number) => (hasHeader ? head.findIndex((h) => re.test(h)) : fallback);
  const nameIdx = col(/name/, 0);
  const phoneIdx = col(/phone|mobile|number|whatsapp/, 1);
  const tagIdx = hasHeader ? head.findIndex((h) => /tag|group|segment/.test(h)) : 2;
  if (phoneIdx < 0) return { ok: false, message: "Couldn't find a phone column. Name it 'phone'." };

  // Columns named like one of the client's custom fields (e.g. "Birthday") fill that field.
  const fieldDefs = readFields((await db.client.findUnique({ where: { id: s.clientId }, select: { customFields: true } }))?.customFields, "customer");
  const fieldCols = hasHeader ? fieldDefs.map((f) => ({ f, i: head.indexOf(f.label.toLowerCase()) })).filter((x) => x.i >= 0) : [];

  const extra = parseTags(extraTags);
  const rows = new Map<string, { name: string; tags: string[]; fields: Record<string, string> }>();
  let invalid = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsv(line);
    const phone = normalizePhone(cells[phoneIdx] ?? "");
    if (!phone) { invalid++; continue; }
    const fields: Record<string, string> = {};
    for (const { f, i } of fieldCols) {
      const checked = cleanValues([f], { [f.key]: cells[i] ?? "" });
      if ("values" in checked && checked.values[f.key]) fields[f.key] = checked.values[f.key];
    }
    rows.set(phone, {
      name: (nameIdx >= 0 && cells[nameIdx]) || "Customer",
      tags: [...new Set([...parseTags(tagIdx >= 0 ? cells[tagIdx] ?? "" : ""), ...extra])],
      fields,
    });
  }
  if (rows.size > 20_000) return { ok: false, message: "Import up to 20,000 customers at a time." };

  const clientId = s.clientId;
  const existing = await db.customer.findMany({ where: { clientId, phone: { in: [...rows.keys()] } }, select: { phone: true, tags: true, extra: true } });
  const known = new Map(existing.map((c) => [c.phone, c.tags]));
  const knownExtra = new Map(existing.map((c) => [c.phone, readValues(c.extra)]));
  const fresh = [...rows].filter(([p]) => !known.has(p));
  const optInAt = new Date();
  await db.customer.createMany({
    data: fresh.map(([phone, r]) => ({ clientId, phone, name: r.name, tags: r.tags, optInSource: optInSource.trim(), optInAt, ...(Object.keys(r.fields).length && { extra: r.fields }) })),
    skipDuplicates: true,
  });
  for (const [phone, r] of rows) {
    const tags = known.get(phone);
    if (tags)
      await db.customer.update({
        where: { clientId_phone: { clientId, phone } },
        data: { name: r.name, tags: [...new Set([...tags, ...r.tags])], ...(Object.keys(r.fields).length && { extra: { ...knownExtra.get(phone), ...r.fields } }) },
      });
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `${fresh.length} added, ${existing.length} updated${invalid ? `, ${invalid} skipped (invalid number)` : ""}.`,
  };
}

import { applyManualLoyaltyDelta, computeCustomerLoyalty, parseManualLoyaltyPoints } from "@/lib/loyalty";

export async function setOptOut(id: string, optedOut: boolean): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.customer.updateMany({ where: { id, ...owned(s) }, data: { optedOut } });
  if (!r.count) return { ok: false, message: "Customer not found." };
  revalidatePath("/dashboard/customers");
  return { ok: true, message: optedOut ? "Customer won't receive campaigns." : "Customer will receive campaigns again." };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.customer.deleteMany({ where: { id, ...owned(s) } });
  if (!r.count) return { ok: false, message: "Customer not found." };
  revalidatePath("/dashboard/customers");
  return { ok: true, message: "Customer and their message history deleted." };
}

/** Awards bonus loyalty points (positive delta) or redeems loyalty points (negative delta) for a specific customer. */
export async function adjustLoyaltyPoints(id: string, delta: number): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, message: "Enter a valid points change." };

  const c = await db.customer.findFirst({
    where: { id, ...owned(s) },
    select: {
      id: true,
      name: true,
      tags: true,
      purchases: true,
      // Bought orders: paid, or confirmed and beyond (the same rule the Customers page uses).
      orders: { where: { OR: [{ paidAt: { not: null } }, { status: { in: ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"] } }] }, select: { total: true } },
    },
  });
  if (!c) return { ok: false, message: "Customer not found." };

  // The balance right now, worked out the same way as on screen.
  const balance = computeCustomerLoyalty({
    name: c.name,
    paidOrdersCount: c.orders.length,
    totalSpent: c.orders.reduce((n, o) => n + o.total, 0),
    sheetPurchases: c.purchases,
    tags: c.tags,
  }).totalPoints;
  if (delta < 0 && -delta > balance) {
    return { ok: false, message: `${c.name} has only ${balance} points, so ${Math.abs(Math.round(delta))} can't be redeemed.` };
  }

  const nextTags = applyManualLoyaltyDelta(c.tags, delta, balance + Math.round(delta));
  const manualAfter = parseManualLoyaltyPoints(nextTags);
  await db.customer.update({ where: { id: c.id }, data: { tags: nextTags } });

  revalidatePath(`/dashboard/customers/${c.id}`);
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard");

  const sign = delta > 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
  return {
    ok: true,
    message:
      delta > 0
        ? `Added ${sign} bonus loyalty points to ${c.name} (manual adjustment: ${manualAfter >= 0 ? `+${manualAfter}` : manualAfter} pts).`
        : `Redeemed ${Math.abs(Math.round(delta))} loyalty points (₹${Math.round(Math.abs(delta) * 0.5)} discount) for ${c.name}.`,
  };
}

