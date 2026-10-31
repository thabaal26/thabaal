import "server-only";

// Messages from Thabaal to business owners (admin panel › Messages). They go on WhatsApp from Thabaal's own number
// (WHATSAPP_* in the environment) in one of two approved templates (owner-messages-core OWNER_TEMPLATES). A message
// is saved with every business's own filled-in copy first; the scheduler (lib/dispatcher.ts) sends them inside quiet
// hours. Payment reminders never go to a business whose plan renews by itself (auto-pay on).

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { loadClientRows, planName } from "./admin-data";
import { db } from "./db";
import { APP_TZ } from "./format";
import { cleanPhone } from "./lead-stages";
import {
  checkOwnerSettings,
  fillFor,
  isAudience,
  isKind,
  isPaymentKind,
  KINDS,
  nextAllowed,
  OWNER_TEMPLATES,
  pickAudience,
  readOwnerSettings,
  reminderOffsets,
  templateFor,
  unknownPlaceholders,
  type OwnerKind,
  type OwnerTarget,
} from "./owner-messages-core";
import { RATES } from "./spend";
import { createMetaTemplate, listMetaTemplates, sendTemplateMessage, waConfig } from "./whatsapp";

export type OwnerActor = { isAdmin: boolean; name: string };
export type OwnerResult = { ok: boolean; message: string; id?: string };

const MAX_TEXT = 900;
const day = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy");

export async function loadOwnerSettings() {
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { ownerMessages: true } });
  return readOwnerSettings(s?.ownerMessages);
}

export async function saveOwnerSettings(actor: OwnerActor, input: unknown): Promise<OwnerResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change this." };
  const c = checkOwnerSettings(input);
  if (!c.ok) return c;
  await db.setting.upsert({ where: { id: 1 }, create: { id: 1, ownerMessages: c.settings }, update: { ownerMessages: c.settings } });
  return { ok: true, message: c.settings.reminders ? "Saved. Automatic payment reminders are on." : "Saved." };
}

/** The owner's WhatsApp: the billing contact's mobile, else the shop's phone; with 91 in front. */
function ownerPhone(appearance: unknown, supportPhone: string | null) {
  const profile = appearance && typeof appearance === "object" ? (appearance as { billingProfile?: { mobile?: string } }).billingProfile : undefined;
  const p = cleanPhone(profile?.mobile ?? "") ?? cleanPhone(supportPhone ?? "");
  return p ? `91${p}` : null;
}

/** Every business, as the Messages page and the sender see it. */
export async function ownerTargets(now = new Date()): Promise<OwnerTarget[]> {
  const [{ rows }, extra] = await Promise.all([loadClientRows(now), db.client.findMany({ select: { id: true, appearance: true, supportPhone: true } })]);
  return rows.map((r) => {
    const x = extra.find((e) => e.id === r.id);
    const lim = r.limits;
    return {
      id: r.id,
      name: r.name,
      owner: r.owner?.name || null,
      phone: ownerPhone(x?.appearance, x?.supportPhone ?? null),
      planName: r.plan ? planName(r.plan) : null,
      amount: r.renewal,
      date: r.endsAt ? day(r.endsAt) : null,
      state: r.state,
      autoPay: r.autoPay,
      atRisk: r.health === "bad",
      nearLimit: !!lim && r.plan !== "business" && (r.usage.staff >= lim.staff || r.usage.campaignsMonth >= lim.camp * 0.9),
      quiet: !!r.lastOpened && r.lastOpened.getTime() < now.getTime() - 21 * 86_400_000,
    };
  });
}

export type NewOwnerMessage = { kind: string; audience: string; picked?: string[]; text: string; when: "now" | "later"; at?: string };

/**
 * Saves a message for every business it is meant for, each with its own filled-in text, and when it may go:
 * now (or the next moment inside quiet hours) or the time picked. Businesses left out are saved as skipped, with why.
 */
export async function createOwnerMessage(actor: OwnerActor, input: NewOwnerMessage, now = new Date()): Promise<OwnerResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can message business owners." };
  if (!isKind(input.kind)) return { ok: false, message: "Pick what kind of message it is." };
  if (!isAudience(input.audience)) return { ok: false, message: "Pick who should get it." };
  const text = String(input.text ?? "").trim();
  if (!text) return { ok: false, message: "Write the message." };
  if (text.length > MAX_TEXT) return { ok: false, message: `Keep it under ${MAX_TEXT} letters; WhatsApp cuts longer ones.` };
  const bad = unknownPlaceholders(text);
  if (bad.length) return { ok: false, message: `{${bad[0]}} isn't something thabaal can fill in. Use {shop}, {owner}, {amount}, {date} or {plan}.` };

  let want = now;
  if (input.when === "later") {
    const at = input.at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.at) ? fromZonedTime(`${input.at}:00`, APP_TZ) : null;
    if (!at || Number.isNaN(at.getTime())) return { ok: false, message: "Pick the day and time to send it." };
    if (at.getTime() < now.getTime() - 60_000) return { ok: false, message: "Pick a time that hasn't passed." };
    if (at.getTime() > now.getTime() + 60 * 86_400_000) return { ok: false, message: "Pick a time within the next 60 days." };
    want = at;
  }
  const settings = await loadOwnerSettings();
  const sendAt = nextAllowed(want, settings, APP_TZ);

  const { to, left } = pickAudience(input.kind, input.audience, await ownerTargets(now), input.picked ?? []);
  if (!to.length) return { ok: false, message: left.length ? `Nobody to send to: ${left.length} left out (${left[0].why}).` : "No business matches this just now." };
  const msg = await db.ownerMessage.create({
    data: {
      kind: input.kind,
      audience: input.audience,
      text,
      sendAt,
      createdBy: actor.name.slice(0, 80),
      to: {
        create: [
          ...to.map((s) => ({ clientId: s.id, phone: s.phone, owner: s.owner, text: fillFor(text, s) })),
          ...left.map(({ shop, why }) => ({ clientId: shop.id, phone: shop.phone, owner: shop.owner, text: fillFor(text, shop), status: "skipped", reason: why })),
        ],
      },
    },
  });
  const when = sendAt.getTime() <= now.getTime() + 60_000 ? "now" : `at ${formatInTimeZone(sendAt, APP_TZ, "d MMM, h:mm a")}`;
  const skipped = left.length ? ` ${left.length} left out (${[...new Set(left.map((l) => l.why))].join(", ")}).` : "";
  return { ok: true, id: msg.id, message: `Going to ${to.length} business${to.length === 1 ? "" : "es"} ${when}.${skipped}` };
}

export async function cancelOwnerMessage(actor: OwnerActor, id: string): Promise<OwnerResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can change this." };
  const done = await db.ownerMessage.updateMany({ where: { id, status: "scheduled" }, data: { status: "cancelled", doneAt: new Date() } });
  if (!done.count) return { ok: false, message: "Only a message that hasn't started sending can be cancelled." };
  await db.ownerMessageTo.updateMany({ where: { messageId: id, status: "queued" }, data: { status: "skipped", reason: "cancelled" } });
  return { ok: true, message: "Cancelled. Nothing was sent." };
}

/** Thabaal's own number is set up, or this is a test copy (nothing reaches WhatsApp; rows are marked simulated). */
function sender() {
  const cfg = waConfig();
  const testCopy = process.env.NODE_ENV !== "production" || process.env.THABAAL_QA === "1";
  return { cfg, ready: cfg.live || testCopy };
}

/** Sends what is due, inside quiet hours. Each business's copy is claimed first, so two runs never send it twice. */
export async function processOwnerMessages(now = new Date(), deadline = Date.now() + 20_000) {
  const settings = await loadOwnerSettings();
  if (nextAllowed(now, settings, APP_TZ).getTime() !== now.getTime()) return { sent: 0, failed: 0 };
  const due = await db.ownerMessage.findMany({ where: { status: { in: ["scheduled", "sending"] }, sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 10 });
  const { cfg, ready } = sender();
  let sent = 0;
  let failed = 0;
  for (const m of due) {
    if (m.status === "scheduled") await db.ownerMessage.updateMany({ where: { id: m.id, status: "scheduled" }, data: { status: "sending" } });
    const t = templateFor(m.kind);
    const rows = await db.ownerMessageTo.findMany({ where: { messageId: m.id, status: "queued" }, take: 50 });
    for (const r of rows) {
      if (Date.now() > deadline) break;
      const claimed = await db.ownerMessageTo.updateMany({ where: { id: r.id, status: "queued" }, data: { status: "sending" } });
      if (!claimed.count) continue;
      if (!ready || !r.phone) {
        await db.ownerMessageTo.update({ where: { id: r.id }, data: { status: "failed", reason: r.phone ? "Thabaal's own WhatsApp number isn't set up (WHATSAPP_* in Vercel)" : "no WhatsApp number" } });
        failed++;
        continue;
      }
      try {
        const res = await sendTemplateMessage(cfg, { to: r.phone, templateName: t.name, language: "en", headerType: "NONE", headerParams: [], bodyParams: [r.owner || "there", r.text] });
        await db.ownerMessageTo.update({ where: { id: r.id }, data: { status: "sent", waId: res.id, simulated: res.simulated, sentAt: new Date() } });
        sent++;
      } catch (e) {
        await db.ownerMessageTo.update({ where: { id: r.id }, data: { status: "failed", reason: (e instanceof Error ? e.message : String(e)).slice(0, 200) } });
        failed++;
      }
    }
    const left = await db.ownerMessageTo.count({ where: { messageId: m.id, status: { in: ["queued", "sending"] } } });
    if (!left) await db.ownerMessage.update({ where: { id: m.id }, data: { status: "done", doneAt: new Date() } });
  }
  return { sent, failed };
}

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
/** A WhatsApp status for one of these messages (from the webhook): delivered, read or failed. False if not ours. */
export async function applyOwnerStatus(s: { id: string; status: string; errors?: { title?: string; message?: string }[] }) {
  const row = await db.ownerMessageTo.findUnique({ where: { waId: s.id }, select: { id: true, status: true } });
  if (!row) return false;
  const st = s.status.toLowerCase();
  if (st === "failed") {
    await db.ownerMessageTo.update({ where: { id: row.id }, data: { status: "failed", reason: (s.errors?.[0]?.message || s.errors?.[0]?.title || "WhatsApp couldn't deliver it").slice(0, 200) } });
  } else if ((RANK[st] ?? 0) > (RANK[row.status] ?? 0)) {
    await db.ownerMessageTo.update({ where: { id: row.id }, data: { status: st } });
  }
  return true;
}

/**
 * Automatic payment reminders: for every business that must pay and isn't on auto-pay, a reminder on the days
 * switched on (3 days before its plan ends, the day, the day after, a week later). Once per business, plan end
 * and day (autoKey), so running often is safe. They are sent by processOwnerMessages, inside quiet hours.
 */
export async function queueAutoReminders(now = new Date()) {
  const settings = await loadOwnerSettings();
  if (!settings.reminders) return 0;
  const offsets = reminderOffsets(settings);
  if (!offsets.length) return 0;
  const today = formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
  const offsetOf = (end: Date) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${formatInTimeZone(end, APP_TZ, "yyyy-MM-dd")}T00:00:00Z`)) / 86_400_000);
  // Cheap first look: each paying business's paid-through moment (its latest verified period's end).
  const ends = await db.planPurchase.groupBy({ by: ["clientId"], where: { status: "VERIFIED", endsAt: { not: null }, client: { planRequired: true } }, _max: { endsAt: true } });
  const due = ends.filter((e) => e._max.endsAt && offsets.includes(offsetOf(e._max.endsAt)));
  if (!due.length) return 0;
  const shops = await ownerTargets(now);
  let queued = 0;
  for (const off of offsets) {
    const ids = due.filter((e) => offsetOf(e._max.endsAt!) === off).map((e) => e.clientId);
    const kind: OwnerKind = off > 0 ? "over" : "rem";
    const { to } = pickAudience(kind, "pick", shops, ids);
    const text = KINDS.find((k) => k.k === kind)!.text;
    const rows = to.map((s) => ({ clientId: s.id, phone: s.phone, owner: s.owner, text: fillFor(text, s), autoKey: `rem:${s.id}:${formatInTimeZone(due.find((e) => e.clientId === s.id)!._max.endsAt!, APP_TZ, "yyyy-MM-dd")}:${off}` }));
    const fresh = rows.length ? await db.ownerMessageTo.findMany({ where: { autoKey: { in: rows.map((r) => r.autoKey) } }, select: { autoKey: true } }) : [];
    const todo = rows.filter((r) => !fresh.some((f) => f.autoKey === r.autoKey));
    if (!todo.length) continue;
    const msg = await db.ownerMessage.create({ data: { kind, audience: "automatic", text, auto: true, sendAt: nextAllowed(now, settings, APP_TZ), createdBy: "Automatic reminder" } });
    const made = await db.ownerMessageTo.createMany({ data: todo.map((r) => ({ ...r, messageId: msg.id })), skipDuplicates: true });
    if (!made.count) await db.ownerMessage.delete({ where: { id: msg.id } });
    queued += made.count;
  }
  return queued;
}

// ---- the two templates on Thabaal's own number -----------------------------------------------------------------

export async function ownerTemplateStatus() {
  const cfg = waConfig();
  if (!cfg.live) return { live: false as const, templates: [] as { name: string; status: string }[] };
  try {
    const all = await listMetaTemplates(cfg);
    return {
      live: true as const,
      templates: Object.values(OWNER_TEMPLATES).map((t) => ({ name: t.name, status: all.find((m) => m.name === t.name)?.status ?? "NOT SUBMITTED" })),
    };
  } catch (e) {
    return { live: true as const, error: e instanceof Error ? e.message : String(e), templates: [] };
  }
}

/** Sends the two templates to Meta for approval on Thabaal's own number (ones already there are left alone). */
export async function submitOwnerTemplates(actor: OwnerActor): Promise<OwnerResult> {
  if (!actor.isAdmin) return { ok: false, message: "Only Thabaal can do this." };
  const cfg = waConfig();
  if (!cfg.live) return { ok: false, message: "Thabaal's own WhatsApp number isn't set up (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel)." };
  const have = new Set((await listMetaTemplates(cfg)).map((t) => t.name));
  const made: string[] = [];
  for (const t of Object.values(OWNER_TEMPLATES)) {
    if (have.has(t.name)) continue;
    await createMetaTemplate(cfg, {
      name: t.name,
      language: "en",
      category: t.category,
      components: [{ type: "BODY", text: t.body, example: { body_text: [["Ganesan", "Your thabaal Growth plan for Ganesh Oils ends on 12 Nov 2026."]] } }],
    });
    made.push(t.name);
  }
  return { ok: true, message: made.length ? `Sent to Meta for approval: ${made.join(", ")}. Approval usually takes minutes to a day.` : "Both templates are already with Meta." };
}

// ---- what was sent ----------------------------------------------------------------------------------------------

export async function loadOwnerLog(now = new Date()) {
  const messages = await db.ownerMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { to: { include: { client: { select: { name: true } } }, orderBy: { status: "asc" } } },
  });
  const monthStart = fromZonedTime(`${formatInTimeZone(now, APP_TZ, "yyyy-MM")}-01T00:00:00`, APP_TZ);
  const month = await db.ownerMessageTo.findMany({
    where: { sentAt: { gte: monthStart }, status: { in: ["sent", "delivered", "read"] } },
    select: { status: true, simulated: true, message: { select: { kind: true } } },
  });
  const real = month.filter((m) => !m.simulated);
  const reached = real.filter((m) => m.status === "delivered" || m.status === "read");
  const cost = reached.reduce((s, m) => s + (isPaymentKind(m.message.kind) ? RATES.utility : RATES.marketing), 0);
  const failedMonth = await db.ownerMessageTo.count({ where: { updatedAt: { gte: monthStart }, status: "failed" } });
  return { messages, sentMonth: month.length, simulatedMonth: month.length - real.length, read: real.filter((m) => m.status === "read").length, real: real.length, failedMonth, cost };
}
