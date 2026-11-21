"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formatPhone, MAX_NUMBERS, readPhones } from "@/lib/phone";
import { asPerson, linkCustomers, LOYALTY_ORDER_SELECT, numbersNote, otherNumbers, setOtherNumbers } from "@/lib/linked-numbers";
import { defaultRegion, homeCityOf, regionsFor } from "@/lib/regions";
import { cleanValues, readFields, readValues } from "@/lib/custom-fields";
import { owned, requireManager, requireUser } from "@/lib/session";
import { revokeTokensForImage } from "@/lib/media-token";
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
  /** The same person's other WhatsApp numbers, comma separated (lib/linked-numbers.ts); undefined leaves them as they are. */
  otherPhones?: string;
};

/**
 * Reads the number box (one number, or several: the first is this customer's, the rest are their other numbers) and
 * the other-numbers box. Returns the main number and the full list of other numbers, or an error for the owner.
 */
function readNumbers(phoneBox: string, otherBox: string | undefined, current: string[]) {
  const main = readPhones(phoneBox);
  const more = readPhones(otherBox);
  const bad = [...main.bad, ...more.bad];
  if (bad.length) return { error: `Couldn't read ${bad.map((b) => `"${b}"`).join(", ")} as a mobile number.` };
  const phone = main.phones[0];
  if (!phone) return { error: "Enter a valid mobile number with country code." };
  const others = [...new Set([...(otherBox === undefined ? current : []), ...main.phones.slice(1), ...more.phones])].filter((p) => p !== phone);
  if (others.length + 1 > MAX_NUMBERS) return { error: `One customer can have up to ${MAX_NUMBERS} numbers.` };
  // Nothing typed about other numbers: leave the links alone.
  const touched = otherBox !== undefined || main.phones.length > 1;
  return { phone, others: touched ? others : null };
}

/** The region to save: one of the client's three, or the default when an area was typed without one. */
async function regionToSave(clientId: string, picked: string | undefined, location: string | null | undefined) {
  const city = homeCityOf(await db.client.findUnique({ where: { id: clientId }, select: { homeCity: true } }));
  if (picked && regionsFor(city).includes(picked)) return picked;
  return location ? defaultRegion(city) : null;
}

export async function saveCustomer(id: string | null, input: CustomerInput): Promise<ActionResult> {
  trackPress("customer.save");
  const s = id ? await requireManager() : await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = id ? await db.customer.findFirst({ where: { id, ...owned(s) } }) : null;
  if (id && !existing) return { ok: false, message: "Customer not found." };
  const clientId = existing?.clientId ?? s.clientId!;

  if (!input.name.trim()) return { ok: false, message: "Enter the customer's name." };
  const current = existing ? (await otherNumbers(clientId, existing)).map((o) => o.phone) : [];
  const numbers = readNumbers(input.phone, input.otherPhones, current);
  if ("error" in numbers) return { ok: false, message: numbers.error! };
  const { phone, others } = numbers;
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

  let savedId = id;
  if (id) {
    await db.customer.update({ where: { id }, data });
    revalidatePath(`/dashboard/customers/${id}`);
  } else {
    if (!input.optInSource?.trim()) return { ok: false, message: "Note how the customer agreed to WhatsApp messages; Meta requires it." };
    savedId = (await db.customer.create({ data: { ...data, clientId, optInSource: input.optInSource.trim(), optInAt: new Date() }, select: { id: true } })).id;
  }
  const note = others ? numbersNote(await setOtherNumbers(clientId, savedId!, others), formatPhone) : "";
  revalidatePath("/dashboard/customers");
  return { ok: true, message: `${id ? "Customer details updated." : "Customer added."}${note}` };
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

  if (!input.name.trim() || input.name.trim() === "(name unclear)") {
    return { ok: false, message: "Enter the customer's name before adding them." };
  }
  // Order sheets often have two numbers for one person ("98653 10945 / 90805 53061"): all of them are saved.
  const typed = readPhones(input.phone);
  if (typed.bad.length) return { ok: false, message: `Couldn't read ${typed.bad.map((b) => `"${b}"`).join(", ")} as a mobile number.` };
  const phone = typed.phones[0];
  if (!phone) return { ok: false, message: "Enter a valid 10-digit mobile number (or number with country code)." };
  if (typed.phones.length > MAX_NUMBERS) return { ok: false, message: `One customer can have up to ${MAX_NUMBERS} numbers.` };

  const location = input.location?.trim() || row.location || null;
  const region = await regionToSave(row.clientId, input.region, location);
  const purchases = input.purchases?.trim() || row.items || null;
  const optInSource = input.optInSource?.trim() || "Bought from us and gave their number";

  const [saved] = await db.$transaction([
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
  const more = typed.phones.slice(1);
  const current = more.length ? (await otherNumbers(row.clientId, saved)).map((o) => o.phone) : [];
  if (more.length) await setOtherNumbers(row.clientId, saved.id, [...current, ...more]);

  revalidatePath("/dashboard/customers");
  return {
    ok: true,
    message: `${input.name.trim()} added to customer directory${typed.phones.length > 1 ? ` with ${typed.phones.length} numbers (${typed.phones.map(formatPhone).join(", ")}); campaigns go to each` : ""}.`,
  };
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

export interface ImportPreviewResult {
  ok: boolean;
  message?: string;
  totalRows: number;
  newCount: number;
  activeExistingCount: number;
  archivedCount: number;
  invalidCount: number;
  archivedPhones: string[];
}

/** Previews a customer CSV before importing, discovering new, active, and archived matches. */
export async function previewCustomerImport(csv: string): Promise<ImportPreviewResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied, totalRows: 0, newCount: 0, activeExistingCount: 0, archivedCount: 0, invalidCount: 0, archivedPhones: [] };
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { ok: false, message: "The file is empty.", totalRows: 0, newCount: 0, activeExistingCount: 0, archivedCount: 0, invalidCount: 0, archivedPhones: [] };

  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /name|phone|mobile|number|whatsapp/.test(h));
  const col = (re: RegExp, fallback: number) => (hasHeader ? head.findIndex((h) => re.test(h)) : fallback);
  const phoneIdx = col(/phone|mobile|number|whatsapp/, 1);
  if (phoneIdx < 0) return { ok: false, message: "Couldn't find a phone column. Name it 'phone'.", totalRows: 0, newCount: 0, activeExistingCount: 0, archivedCount: 0, invalidCount: 0, archivedPhones: [] };

  const phonesFound: string[] = [];
  let invalid = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsv(line);
    const phones = readPhones(cells[phoneIdx] ?? "").phones.slice(0, MAX_NUMBERS);
    if (!phones.length) { invalid++; continue; }
    phonesFound.push(...phones);
  }

  const clientId = s.clientId;
  const uniquePhones = [...new Set(phonesFound)];
  const existing = await db.customer.findMany({
    where: { clientId, phone: { in: uniquePhones } },
    select: { phone: true, deletedAt: true },
  });

  const existingMap = new Map(existing.map((c) => [c.phone, c.deletedAt]));
  let newCount = 0;
  let activeExistingCount = 0;
  const archivedPhones: string[] = [];

  for (const p of uniquePhones) {
    if (!existingMap.has(p)) {
      newCount++;
    } else if (existingMap.get(p) != null) {
      archivedPhones.push(p);
    } else {
      activeExistingCount++;
    }
  }

  return {
    ok: true,
    totalRows: lines.length - (hasHeader ? 1 : 0),
    newCount,
    activeExistingCount,
    archivedCount: archivedPhones.length,
    invalidCount: invalid,
    archivedPhones,
  };
}

export async function importCustomers(
  csv: string,
  extraTags: string,
  optInSource = "",
  opts?: { restoreArchived?: boolean },
): Promise<ActionResult> {
  trackPress("customer.import");
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
  // A cell with two numbers ("98653 10945 / 90805 53061") is one person: each number is saved and linked.
  const people: string[][] = [];
  let invalid = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsv(line);
    const phones = readPhones(cells[phoneIdx] ?? "").phones.slice(0, MAX_NUMBERS);
    if (!phones.length) { invalid++; continue; }
    if (phones.length > 1) people.push(phones);
    const fields: Record<string, string> = {};
    for (const { f, i } of fieldCols) {
      const checked = cleanValues([f], { [f.key]: cells[i] ?? "" });
      if ("values" in checked && checked.values[f.key]) fields[f.key] = checked.values[f.key];
    }
    const row = {
      name: (nameIdx >= 0 && cells[nameIdx]) || "Customer",
      tags: [...new Set([...parseTags(tagIdx >= 0 ? cells[tagIdx] ?? "" : ""), ...extra])],
      fields,
    };
    for (const phone of phones) rows.set(phone, row);
  }
  if (rows.size > 20_000) return { ok: false, message: "Import up to 20,000 customers at a time." };

  const clientId = s.clientId;
  const existing = await db.customer.findMany({
    where: { clientId, phone: { in: [...rows.keys()] } },
    select: { phone: true, tags: true, extra: true, deletedAt: true, optedOut: true },
  });
  const known = new Map(existing.map((c) => [c.phone, c]));
  const knownExtra = new Map(existing.map((c) => [c.phone, readValues(c.extra)]));
  const fresh = [...rows].filter(([p]) => !known.has(p));
  const optInAt = new Date();
  await db.customer.createMany({
    data: fresh.map(([phone, r]) => ({ clientId, phone, name: r.name, tags: r.tags, optInSource: optInSource.trim(), optInAt, ...(Object.keys(r.fields).length && { extra: r.fields }) })),
    skipDuplicates: true,
  });

  let restoredCount = 0;
  for (const [phone, r] of rows) {
    const cust = known.get(phone);
    if (cust) {
      const isArchived = cust.deletedAt != null;
      const shouldRestore = isArchived && opts?.restoreArchived === true;
      if (shouldRestore) restoredCount++;

      // OD-03 MANDATORY RULE: Never modify or reset optedOut! Preserve existing consent status.
      await db.customer.update({
        where: { clientId_phone: { clientId, phone } },
        data: {
          name: r.name,
          tags: [...new Set([...cust.tags, ...r.tags])],
          ...(shouldRestore && { deletedAt: null, deletedBy: null, deleteReason: null }),
          ...(Object.keys(r.fields).length && { extra: { ...knownExtra.get(phone), ...r.fields } }),
        },
      });
    }
  }
  let linked = 0;
  if (people.length) {
    const ids = new Map((await db.customer.findMany({ where: { clientId, phone: { in: people.flat() } }, select: { id: true, phone: true } })).map((c) => [c.phone, c.id]));
    for (const phones of people) if (await linkCustomers(clientId, phones.map((p) => ids.get(p)).filter((x): x is string => Boolean(x)))) linked++;
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `${fresh.length} added, ${existing.length} updated${restoredCount ? ` (${restoredCount} restored from archive)` : ""}${linked ? `, ${linked} with more than one number` : ""}${invalid ? `, ${invalid} skipped (invalid number)` : ""}. Marketing consent was strictly preserved.`,
  };
}

import { applyManualLoyaltyDelta, LOYALTY_RULE_FIELDS, loyaltyFromOrders, loyaltyRules, parseManualLoyaltyPoints } from "@/lib/loyalty";
import { trackPress } from "@/lib/usage";

export async function setOptOut(id: string, optedOut: boolean): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.customer.updateMany({ where: { id, ...owned(s) }, data: { optedOut } });
  if (!r.count) return { ok: false, message: "Customer not found." };
  revalidatePath("/dashboard/customers");
  return { ok: true, message: optedOut ? "Customer won't receive campaigns." : "Customer will receive campaigns again." };
}

export async function deleteCustomer(id: string, reason?: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = await db.customer.findFirst({ where: { id, ...owned(s) } });
  if (!existing) return { ok: false, message: "Customer not found." };

  try {
    // Soft delete: preserve customer record and all historical relations (orders, messages, payments, loyalty)
    await db.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: (s as any).userId ?? "manager",
        deleteReason: reason || "User archived customer",
      },
    });

    // F-02: Revoke media access tokens for customer documents upon archival
    await revokeTokensForImage(`cust:${id}`, { clientId: existing.clientId, reason: "Customer profile archived" });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${id}`);
    return { ok: true, message: "Customer moved to Archived Customers." };
  } catch (err: any) {
    if (err?.code === "P2003" || err?.message?.includes("foreign key constraint")) {
      return { ok: false, message: "Cannot archive customer: foreign key relational constraint error." };
    }
    throw err;
  }
}

/** Restores an archived (soft-deleted) customer profile to the active customer directory. */
export async function restoreCustomer(id: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = await db.customer.findFirst({ where: { id, ...owned(s) } });
  if (!existing) return { ok: false, message: "Customer not found." };

  // Un-archive customer profile. Crucially, existing marketing consent (optedOut) is strictly preserved!
  await db.customer.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
    },
  });
  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/replies");
  return { ok: true, message: "Customer restored to active directory. Marketing consent unchanged." };
}

/** Awards bonus loyalty points (positive delta) or redeems loyalty points (negative delta) for a specific customer. */
export async function adjustLoyaltyPoints(
  id: string,
  delta: number,
  opts: { kind?: "give" | "take" | "redeem"; reason?: string; told?: boolean; idempotencyKey?: string } = {},
): Promise<ActionResult & { duplicate?: boolean }> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, message: "Enter a valid points change." };
  const kind = opts.kind ?? (delta > 0 ? "give" : "take");
  // On a bill, points go in ₹25 steps (50 points), at most ₹250 (500 points), as on orders.
  if (kind === "redeem" && (delta >= 0 || -delta % 50 !== 0 || -delta > 500))
    return { ok: false, message: "Use points for a bill in steps of 50 (₹25), up to 500 points (₹250)." };

  const preliminary = await db.customer.findFirst({
    where: { id, ...owned(s) },
    select: { id: true, personId: true, clientId: true },
  });
  if (!preliminary) return { ok: false, message: "Customer not found." };

  const user = await requireUser();

  const result = await db.$transaction(async (tx) => {
    // Acquire customer-wide advisory lock (LOY-02)
    const lockTarget = preliminary.personId || preliminary.id;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('loyalty_cust:' || ${lockTarget})::bigint)`;

    const c = await tx.customer.findFirst({
      where: { id, ...owned(s) },
      select: {
        id: true,
        personId: true,
        clientId: true,
        name: true,
        tags: true,
        purchases: true,
        client: { select: LOYALTY_RULE_FIELDS },
        orders: { select: LOYALTY_ORDER_SELECT },
      },
    });
    if (!c) return { ok: false, message: "Customer not found." };

    // The balance right now, evaluated fresh under lock
    const personCustomer = await asPerson(c, tx as unknown as { customer: typeof db.customer });
    const balance = loyaltyFromOrders(personCustomer, { rules: loyaltyRules(c.client) }).totalPoints;
    if (delta < 0 && -delta > balance) {
      return { ok: false, message: `${c.name} has only ${balance} points, so ${Math.abs(Math.round(delta))} can't be redeemed.` };
    }
    if (kind === "redeem" && balance < 50) return { ok: false, message: `${c.name} needs at least 50 points to use them on a bill.` };

    // Check existing idempotency key before mutating state (LOY-IDEM-01)
    if (opts.idempotencyKey) {
      const existing = await tx.loyaltyEntry.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
      if (existing) {
        // Enforce strict tenant and customer ownership boundary (cross-tenant replay defense)
        if (existing.clientId !== c.clientId || existing.customerId !== c.id) {
          return {
            ok: false,
            message: "Idempotency key conflict: this key has already been used for another operation.",
          };
        }
        return {
          ok: true,
          message: `Previously applied (${existing.delta > 0 ? `+${existing.delta}` : existing.delta} pts).`,
          customerId: c.id,
          duplicate: true,
        };
      }
    }

    const nextTags = applyManualLoyaltyDelta(c.tags, delta, balance + Math.round(delta));
    const manualAfter = parseManualLoyaltyPoints(nextTags);
    await tx.customer.update({ where: { id: c.id }, data: { tags: nextTags } });

    // The history line (Customers › Loyalty › Point history); throws on failure inside transaction to maintain atomicity (LOY-03)
    const idempotencyKey = opts.idempotencyKey || `manual-loyalty:${c.id}:${Math.round(delta)}:${Date.now()}`;
    try {
      await tx.loyaltyEntry.create({
        data: {
          clientId: c.clientId,
          customerId: c.id,
          delta: Math.round(delta),
          kind,
          reason: (opts.reason?.trim() || (kind === "redeem" ? "Walk-in bill" : "Other")).slice(0, 120),
          byName: user.name || user.email,
          told: Boolean(opts.told),
          idempotencyKey,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002" && opts.idempotencyKey) {
        const existing = await tx.loyaltyEntry.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
        if (existing) {
          if (existing.clientId !== c.clientId || existing.customerId !== c.id) {
            return {
              ok: false,
              message: "Idempotency key conflict: this key has already been used for another operation.",
            };
          }
          return {
            ok: true,
            message: `Previously applied (${existing.delta > 0 ? `+${existing.delta}` : existing.delta} pts).`,
            customerId: c.id,
            duplicate: true,
          };
        }
      }
      throw err;
    }

    const sign = delta > 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
    const message =
      kind === "redeem"
        ? `Used ${Math.abs(Math.round(delta))} points of ${c.name}'s for ₹${Math.round(Math.abs(delta) * 0.5)} off the bill.`
        : kind === "take"
          ? `Took back ${Math.abs(Math.round(delta))} points from ${c.name}.`
          : delta > 0
            ? `Added ${sign} bonus loyalty points to ${c.name} (manual adjustment: ${manualAfter >= 0 ? `+${manualAfter}` : manualAfter} pts).`
            : `Redeemed ${Math.abs(Math.round(delta))} loyalty points (₹${Math.round(Math.abs(delta) * 0.5)} discount) for ${c.name}.`;

    return { ok: true, message, customerId: c.id };
  });

  if (!result.ok) return result;

  revalidatePath(`/dashboard/customers/${result.customerId}`);
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard");

  return { ok: true, message: result.message };
}


/** Adds one tag to the chosen customers (Customers › select › Add a tag / Make a campaign for these). */
export async function tagCustomers(ids: string[], rawTag: string): Promise<ActionResult & { tag?: string }> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const tag = rawTag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9:_-]/g, "").slice(0, 40);
  if (!tag) return { ok: false, message: "Type a tag, e.g. diwali-offer." };
  const pick = [...new Set(ids)].slice(0, 5000);
  const found = await db.customer.findMany({ where: { id: { in: pick }, ...owned(s) }, select: { id: true, tags: true } });
  const todo = found.filter((c) => !c.tags.includes(tag));
  await db.$transaction(todo.map((c) => db.customer.update({ where: { id: c.id }, data: { tags: { push: tag } } })));
  revalidatePath("/dashboard/customers");
  return { ok: true, tag, message: `Tag “${tag}” added to ${todo.length} customer${todo.length === 1 ? "" : "s"}${found.length > todo.length ? ` (${found.length - todo.length} already had it)` : ""}.` };
}
