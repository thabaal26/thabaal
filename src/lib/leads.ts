import "server-only";

// Enquiries (leads) for the admin panel: shops that asked about thabaal, from first contact to a paying business.
// Callers pass who is acting; the server actions (app/dashboard/actions/leads.ts) check the login is an admin first.
// Every change is written to the enquiry's history (LeadActivity), so "What has happened" is the real record.

import { formatInTimeZone } from "date-fns-tz";
import { isPlanKey } from "./subscription-core";
import { db } from "./db";
import { APP_TZ } from "./format";
import { ensureOrderPrefix } from "./orders";
import { newClientData } from "./client-create";
import { cleanPhone, furthest, isLeadStage, isOpenStage, LEAD_SOURCES, stageName } from "./lead-stages";

export type LeadActor = { isAdmin: boolean; id: string; name: string };
export type LeadResult = { ok: boolean; message: string; id?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const todayKey = (now = new Date()) => formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
/** A "yyyy-MM-dd" day as the value for a DATE column, and back. */
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const say = (d: string) => formatInTimeZone(asDate(d), "UTC", "d MMM yyyy");
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export type LeadInput = {
  shop: string;
  person?: string;
  phone: string;
  town?: string;
  sells?: string;
  source: string;
  plan?: string;
  ownerId?: string;
  note?: string;
};

async function checkInput(input: LeadInput) {
  const shop = text(input.shop, 120);
  if (!shop) return { ok: false as const, message: "Enter the shop's name." };
  const phone = cleanPhone(input.phone);
  if (!phone) return { ok: false as const, message: "Enter a 10-digit mobile number." };
  if (!(LEAD_SOURCES as readonly string[]).includes(input.source)) return { ok: false as const, message: "Pick where the enquiry came from." };
  const plan = input.plan ? (isPlanKey(input.plan) ? input.plan : null) : null;
  if (input.plan && !plan) return { ok: false as const, message: "Pick one of the plans." };
  let ownerId: string | null = null;
  if (input.ownerId) {
    // Only someone who can sign in to the admin panel can follow up an enquiry.
    const owner = await db.user.findFirst({ where: { id: input.ownerId, role: "ADMIN" }, select: { id: true } });
    if (!owner) return { ok: false as const, message: "Pick who follows up from the list." };
    ownerId = owner.id;
  }
  return {
    ok: true as const,
    data: { shop, phone, person: text(input.person, 80) || null, town: text(input.town, 60) || null, sells: text(input.sells, 120) || null, source: input.source, plan, ownerId, note: String(input.note ?? "").trim().slice(0, 1000) || null },
  };
}

/** Adds an enquiry, waiting in New enquiry with a first follow-up today. One open enquiry per phone number. */
export async function addLead(actor: LeadActor, input: LeadInput, now = new Date()): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can add enquiries." };
  const v = await checkInput(input);
  if (!v.ok) return v;
  const open = await db.lead.findFirst({ where: { phone: v.data.phone, stage: { notIn: ["won", "lost"] } }, select: { shop: true } });
  if (open) return { ok: false, message: `${open.shop} already has an open enquiry with this number.` };
  const lead = await db.lead.create({
    data: {
      ...v.data,
      nextOn: asDate(todayKey(now)),
      createdBy: actor.name,
      activity: { create: { kind: "created", text: `Enquiry added (${v.data.source})`, by: actor.name } },
    },
  });
  return { ok: true, id: lead.id, message: "Added. It is waiting in New enquiry for a first call." };
}

/** Changes what we know about an enquiry, and who follows it up. */
export async function updateLead(actor: LeadActor, id: string, input: LeadInput): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change enquiries." };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, message: "Enquiry not found." };
  const v = await checkInput(input);
  if (!v.ok) return v;
  if (v.data.phone !== lead.phone && isOpenStage(lead.stage)) {
    const open = await db.lead.findFirst({ where: { id: { not: id }, phone: v.data.phone, stage: { notIn: ["won", "lost"] } }, select: { shop: true } });
    if (open) return { ok: false, message: `${open.shop} already has an open enquiry with this number.` };
  }
  const ownerChanged = v.data.ownerId !== lead.ownerId;
  const owner = ownerChanged && v.data.ownerId ? await db.user.findUnique({ where: { id: v.data.ownerId }, select: { name: true, email: true } }) : null;
  await db.lead.update({
    where: { id },
    data: {
      ...v.data,
      activity: {
        create: {
          kind: "edit",
          text: ownerChanged ? (owner ? `Details saved · ${owner.name || owner.email} follows up` : "Details saved · nobody follows up") : "Details saved",
          by: actor.name,
        },
      },
    },
  });
  return { ok: true, message: "Saved." };
}

/** Moves an enquiry to another stage. Won or lost closes it (no follow-up); moving back opens it again. */
export async function moveLead(actor: LeadActor, id: string, stage: string, now = new Date()): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change enquiries." };
  if (!isLeadStage(stage)) return { ok: false, message: "Pick a stage." };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, message: "Enquiry not found." };
  if (lead.stage === stage) return { ok: true, message: `Already in ${stageName(stage)}.` };
  if (lead.clientId) return { ok: false, message: "This enquiry is already a business, so it stays Won." };
  const closing = !isOpenStage(stage);
  await db.lead.update({
    where: { id },
    data: {
      stage,
      reached: furthest(lead.reached, stage),
      closedAt: closing ? now : null,
      // Re-opened: follow up today unless a day is already set.
      nextOn: closing ? null : (lead.nextOn ?? asDate(todayKey(now))),
      activity: { create: { kind: "stage", text: `Moved to ${stageName(stage)}`, by: actor.name } },
    },
  });
  return {
    ok: true,
    message: stage === "won" ? `${lead.shop} is won. Make it a business when you are ready.` : `${lead.shop} moved to ${stageName(stage)}.`,
  };
}

/** Notes a call (what happened), optionally with the next follow-up day. A first call moves New to Contacted. */
export async function logCall(actor: LeadActor, id: string, input: { text: string; nextOn?: string }, now = new Date()): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change enquiries." };
  const note = String(input.text ?? "").trim().slice(0, 500);
  if (!note) return { ok: false, message: "Write what happened on the call." };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, message: "Enquiry not found." };
  const next = input.nextOn ? checkDay(input.nextOn, now) : null;
  if (next && !next.ok) return next;
  if (next && !isOpenStage(lead.stage)) return { ok: false, message: "This enquiry is closed, so it has no follow-up." };
  const reach = lead.stage === "new";
  await db.lead.update({
    where: { id },
    data: {
      ...(reach ? { stage: "contact", reached: furthest(lead.reached, "contact") } : {}),
      ...(next?.ok ? { nextOn: asDate(next.day) } : {}),
      activity: {
        create: [
          { kind: "call", text: note, by: actor.name },
          ...(reach ? [{ kind: "stage", text: "Moved to Contacted", by: actor.name }] : []),
          ...(next?.ok ? [{ kind: "next", text: `Next follow-up ${say(next.day)}`, by: actor.name }] : []),
        ],
      },
    },
  });
  return { ok: true, message: next?.ok ? `Call noted. Next follow-up ${say(next.day)}.` : "Call noted." };
}

function checkDay(day: string, now: Date): { ok: true; day: string } | { ok: false; message: string } {
  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { ok: false, message: "Pick a day for the follow-up." };
  if (day < todayKey(now)) return { ok: false, message: "Pick today or a later day." };
  return { ok: true, day };
}

/** Sets the next follow-up day of an open enquiry. */
export async function setNextFollowUp(actor: LeadActor, id: string, day: string, now = new Date()): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change enquiries." };
  const c = checkDay(day, now);
  if (!c.ok) return c;
  const lead = await db.lead.findUnique({ where: { id }, select: { stage: true, shop: true } });
  if (!lead) return { ok: false, message: "Enquiry not found." };
  if (!isOpenStage(lead.stage)) return { ok: false, message: "This enquiry is closed, so it has no follow-up." };
  await db.lead.update({ where: { id }, data: { nextOn: asDate(c.day), activity: { create: { kind: "next", text: `Next follow-up ${say(c.day)}`, by: actor.name } } } });
  return { ok: true, message: `Follow-up set for ${say(c.day)}.` };
}

/**
 * Turns a won enquiry into a business (All clients), so nothing is typed twice: name, city and phone come from
 * the enquiry. The enquiry is marked won and linked to the business; doing it twice makes nothing new.
 */
export async function convertLead(actor: LeadActor, id: string, input: { name: string; city: string; businessType?: string }, now = new Date()): Promise<LeadResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can add businesses." };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, message: "Enquiry not found." };
  if (lead.clientId) return { ok: false, message: "This enquiry is already a business.", id: lead.clientId };
  if (lead.stage !== "won") return { ok: false, message: "Mark the enquiry as won first." };
  const v = newClientData({ name: input.name, city: input.city, businessType: input.businessType });
  if (!v.ok) return v;
  if (await db.client.findUnique({ where: { name: v.name }, select: { id: true } })) return { ok: false, message: `${v.name} already exists. Use another name.` };
  const clientId = await db.$transaction(async (tx) => {
    const c = await tx.client.create({ data: { ...v.data, supportPhone: lead.phone } });
    // Only an enquiry not yet linked: pressing twice can't make two businesses.
    const linked = await tx.lead.updateMany({ where: { id, clientId: null, stage: "won" }, data: { clientId: c.id, closedAt: lead.closedAt ?? now } });
    if (linked.count !== 1) throw new Error("already converted");
    await tx.leadActivity.create({ data: { leadId: id, kind: "converted", text: `Became the business ${v.name}`, by: actor.name } });
    return c.id;
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "already converted") return null;
    throw e;
  });
  if (!clientId) return { ok: false, message: "This enquiry is already a business." };
  await ensureOrderPrefix(clientId).catch(() => null);
  return { ok: true, id: clientId, message: `${v.name} added to All clients. Add their login and WhatsApp number there.` };
}

// ---- reading, for the Enquiries page -----------------------------------------------------------------------------

export async function loadLeads() {
  const [leads, team] = await Promise.all([
    db.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { id: true, name: true, email: true } }, client: { select: { id: true, name: true } } },
    }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return { leads, team: team.map((t) => ({ id: t.id, name: t.name || t.email })) };
}

export async function loadLead(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true, email: true } }, client: { select: { id: true, name: true } }, activity: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
  });
}
