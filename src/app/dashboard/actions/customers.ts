"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import type { ActionResult } from "./templates";

const parseTags = (s: string) => [...new Set(s.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

export async function saveCustomer(id: string | null, input: { name: string; phone: string; tags: string }): Promise<ActionResult> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const phone = normalizePhone(input.phone);
  if (!input.name.trim()) return { ok: false, message: "Enter the customer's name." };
  if (!phone) return { ok: false, message: "Enter a valid mobile number with country code." };
  const clash = await db.customer.findUnique({ where: { clientId_phone: { clientId: s.clientId, phone } } });
  if (clash && clash.id !== id) return { ok: false, message: `+${phone} already belongs to ${clash.name}.` };
  const data = { name: input.name.trim(), phone, tags: parseTags(input.tags) };
  if (id) await db.customer.update({ where: { id, clientId: s.clientId }, data });
  else await db.customer.create({ data: { ...data, clientId: s.clientId } });
  revalidatePath("/dashboard/customers");
  return { ok: true, message: id ? "Customer updated." : "Customer added." };
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

export async function importCustomers(csv: string, extraTags: string): Promise<ActionResult> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { ok: false, message: "The file is empty." };

  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /name|phone|mobile|number|whatsapp/.test(h));
  const col = (re: RegExp, fallback: number) => (hasHeader ? head.findIndex((h) => re.test(h)) : fallback);
  const nameIdx = col(/name/, 0);
  const phoneIdx = col(/phone|mobile|number|whatsapp/, 1);
  const tagIdx = hasHeader ? head.findIndex((h) => /tag|group|segment/.test(h)) : 2;
  if (phoneIdx < 0) return { ok: false, message: "Couldn't find a phone column. Name it 'phone'." };

  const extra = parseTags(extraTags);
  const rows = new Map<string, { name: string; tags: string[] }>();
  let invalid = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsv(line);
    const phone = normalizePhone(cells[phoneIdx] ?? "");
    if (!phone) { invalid++; continue; }
    rows.set(phone, {
      name: (nameIdx >= 0 && cells[nameIdx]) || "Customer",
      tags: [...new Set([...parseTags(tagIdx >= 0 ? cells[tagIdx] ?? "" : ""), ...extra])],
    });
  }
  if (rows.size > 20_000) return { ok: false, message: "Import up to 20,000 customers at a time." };

  const clientId = s.clientId;
  const existing = await db.customer.findMany({ where: { clientId, phone: { in: [...rows.keys()] } }, select: { phone: true, tags: true } });
  const known = new Map(existing.map((c) => [c.phone, c.tags]));
  const fresh = [...rows].filter(([p]) => !known.has(p));
  await db.customer.createMany({ data: fresh.map(([phone, r]) => ({ clientId, phone, name: r.name, tags: r.tags })), skipDuplicates: true });
  for (const [phone, r] of rows) {
    const tags = known.get(phone);
    if (tags) await db.customer.update({ where: { clientId_phone: { clientId, phone } }, data: { name: r.name, tags: [...new Set([...tags, ...r.tags])] } });
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `${fresh.length} added, ${existing.length} updated${invalid ? `, ${invalid} skipped (invalid number)` : ""}.`,
  };
}

export async function setOptOut(id: string, optedOut: boolean): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  await db.customer.update({ where: { id }, data: { optedOut } });
  revalidatePath("/dashboard/customers");
  return { ok: true, message: optedOut ? "Customer won't receive campaigns." : "Customer will receive campaigns again." };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  await db.customer.delete({ where: { id } });
  revalidatePath("/dashboard/customers");
  return { ok: true, message: "Customer and their message history deleted." };
}
