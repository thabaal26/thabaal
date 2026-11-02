"use server";

import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dispatch, startRun } from "@/lib/dispatcher";
import { APP_TZ } from "@/lib/format";
import { retryHeldBack } from "@/lib/held";
import { campaignAudienceWhere } from "@/lib/audiences";
import { decodeTags, TAGS_PREFIX } from "@/lib/audience-tags";
import { getSettings, templateSendable } from "@/lib/provider";
import { unmappedVars, type VarMap } from "@/lib/template";
import { isQuietTime } from "@/lib/rules";
import { computeNextRun, TEST_TAG } from "@/lib/schedule";
import { senderFor } from "@/lib/senders";
import { mine, requireAdmin, requireManager } from "@/lib/session";
import { sendToCustomer } from "./send";
import type { ActionResult } from "./templates";
import { trackPress } from "@/lib/usage";
import { notOpeningOffers } from "@/lib/engagement";
import { planCapacityBlock } from "@/lib/subscription";

export type CampaignInput = {
  name: string;
  templateId: string;
  /** WhatsApp number to send from; empty uses the client's default. */
  senderId: string;
  audienceTag: string;
  scheduleType: "ONCE" | "WEEKLY";
  daysOfWeek: number[];
  sendTime: string;
  runDate: string; // yyyy-MM-dd, ONCE only
  batchSize: number;
  intervalMinutes: number;
  active: boolean;
  /** Customers added by hand on top of "Send to", and customers left out of it. */
  includeIds: string[];
  excludeIds: string[];
  /** Leave out people who didn't open their last offers (lib/engagement.ts). */
  skipUnread: boolean;
};

/** At most this many people added or left out by hand (each list). */
const MAX_HAND_PICKED = 500;

/** The ids among these that are this client's customers, once each. */
async function ownCustomers(clientId: string, ids: unknown): Promise<string[]> {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && /^[a-z0-9]{10,40}$/i.test(x)))].slice(0, MAX_HAND_PICKED) : [];
  if (!list.length) return [];
  return (await db.customer.findMany({ where: { clientId, id: { in: list } }, select: { id: true } })).map((c) => c.id);
}

function refresh() {
  revalidatePath("/dashboard", "layout");
}

export async function saveCampaign(id: string | null, input: CampaignInput): Promise<ActionResult> {
  trackPress("campaign.save");
  const s = id ? await requireManager() : await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = id ? await db.campaign.findUnique({ where: { id }, select: { clientId: true } }) : null;
  if (id && (!existing || !mine(s, existing.clientId))) return { ok: false, message: "Campaign not found." };
  const clientId = existing?.clientId ?? s.clientId!;

  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Give the campaign a name.");
  const template = await db.template.findUnique({ where: { id: input.templateId, clientId } });
  if (!template) errors.push("Choose a template.");
  else if (template.category === "AUTHENTICATION") errors.push("Authentication templates can't be used in campaigns.");
  else {
    const missing = unmappedVars({ category: template.category, body: template.body, variables: template.variables as VarMap });
    if (missing.length) errors.push(`"${template.name}" has no value set for ${missing.map((n) => `{{${n}}}`).join(", ")}. Set it in Templates first, or every customer would get their name there.`);
  }
  const { number: sender } = await senderFor(clientId, input.senderId || null);
  if (input.senderId && sender?.id !== input.senderId) errors.push("Choose a number to send from.");
  if (template && sender && template.businessAccountId && template.businessAccountId !== sender.businessAccountId)
    errors.push(`"${template.name}" is approved in a different WhatsApp account than ${sender.label}. Pick a template from that number's account.`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime)) errors.push("Choose a send time.");
  if (input.scheduleType === "WEEKLY" && !input.daysOfWeek.length) errors.push("Pick at least one day of the week.");
  if (input.audienceTag.startsWith(TAGS_PREFIX) && !decodeTags(input.audienceTag)?.tags.length) errors.push('Pick at least one tag under "Send to", or choose All customers.');
  if (input.scheduleType === "ONCE" && !/^\d{4}-\d{2}-\d{2}$/.test(input.runDate)) errors.push("Choose a date.");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 1000) errors.push("Batch size must be between 1 and 1,000.");
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 1440)
    errors.push("Interval must be between 1 and 1,440 minutes.");

  // Say it now instead of letting the campaign wait silently: marketing isn't sent in quiet hours.
  if (template?.category === "MARKETING" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime)) {
    const client = await db.client.findUnique({ where: { id: clientId }, select: { quietFrom: true, quietTo: true } });
    if (client && isQuietTime(client, input.sendTime))
      errors.push(`${input.sendTime} is inside quiet hours (${client.quietFrom} to ${client.quietTo}), so marketing would be held. Pick a time outside them, or turn quiet hours off for this client.`);
  }
  if (errors.length) return { ok: false, errors };

  const runAt = input.scheduleType === "ONCE" ? fromZonedTime(`${input.runDate}T${input.sendTime}:00`, APP_TZ) : null;
  if (runAt && runAt <= new Date() && input.active) return { ok: false, errors: ["That date and time has already passed."] };

  const [includeIds, excludeIds] = await Promise.all([ownCustomers(clientId, input.includeIds), ownCustomers(clientId, input.excludeIds)]);
  const data = {
    includeIds: includeIds.filter((x) => !excludeIds.includes(x)),
    excludeIds,
    skipUnread: input.skipUnread === true,
    name: input.name.trim(),
    templateId: input.templateId,
    senderId: input.senderId || null,
    audienceTag: input.audienceTag.trim() || null,
    scheduleType: input.scheduleType,
    daysOfWeek: input.scheduleType === "WEEKLY" ? [...new Set(input.daysOfWeek)].sort() : [],
    sendTime: input.sendTime,
    runAt,
    timezone: APP_TZ,
    batchSize: input.batchSize,
    intervalMinutes: input.intervalMinutes,
    active: input.active,
  };
  const nextRunAt = input.active ? computeNextRun(data) : null;

  const saved = id
    ? await db.campaign.update({ where: { id }, data: { ...data, nextRunAt } })
    : await db.campaign.create({ data: { ...data, clientId, nextRunAt } });

  // Batch size and interval apply to runs already in progress from their next batch.
  refresh();
  return { ok: true, id: saved.id, message: id ? "Campaign updated." : "Campaign created." };
}

export async function toggleCampaign(id: string, active: boolean): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || !mine(s, c.clientId)) return { ok: false, message: "Campaign not found." };
  const nextRunAt = active ? computeNextRun(c) : null;
  if (active && !nextRunAt) return { ok: false, message: "Nothing left to schedule. Edit the date or days first." };
  await db.campaign.update({ where: { id }, data: { active, nextRunAt } });
  refresh();
  return { ok: true, message: active ? "Campaign resumed." : "Campaign paused." };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const owner = await db.campaign.findUnique({ where: { id }, select: { clientId: true } });
  if (!owner || !mine(s, owner.clientId)) return { ok: false, message: "Campaign not found." };
  await db.message.deleteMany({ where: { run: { campaignId: id }, status: "QUEUED" } });
  await db.campaign.delete({ where: { id } });
  refresh();
  return { ok: true, message: "Campaign deleted. Sent messages stay in the log." };
}

export async function runCampaignNow(id: string): Promise<ActionResult> {
  trackPress("campaign.run");
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id }, include: { template: true } });
  if (!c || !mine(s, c.clientId)) return { ok: false, message: "Campaign not found." };
  if (!templateSendable(await getSettings(), c.template)) return { ok: false, message: "The template isn't approved by Meta yet." };
  const busy = await db.campaignRun.findFirst({ where: { campaignId: id, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"] } } });
  if (busy) return { ok: false, message: "This campaign is already sending. Wait for it to finish or stop it." };
  const block = await planCapacityBlock(c.clientId, "camp");
  if (block) return { ok: false, message: block };
  const run = await startRun(c, new Date());
  await dispatch();
  refresh();
  return { ok: true, message: `Started: ${run.total} customer${run.total === 1 ? "" : "s"} queued, ${c.batchSize} every ${c.intervalMinutes} min.` };
}

/**
 * Sends the campaign's message once to the client's customers tagged "test" (your own numbers),
 * from the campaign's number, so you can see it before real customers do. Skips quiet hours
 * and the gap between offers, because these are your numbers.
 */
export async function sendCampaignTest(id: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id }, select: { clientId: true, templateId: true, senderId: true } });
  if (!c || !mine(s, c.clientId)) return { ok: false, message: "Campaign not found." };
  const testers = await db.customer.findMany({ where: { clientId: c.clientId, tags: { has: TEST_TAG } }, select: { id: true, name: true }, take: 5 });
  if (!testers.length) return { ok: false, message: `No customers are tagged "${TEST_TAG}". Add that tag to your own number on the Customers page.` };

  const results = await Promise.all(testers.map((t) => sendToCustomer(t.id, c.templateId, c.senderId, true)));
  const failed = results.filter((r) => !r.ok);
  return failed.length
    ? { ok: false, message: `Test failed: ${failed[0].message}` }
    : { ok: true, message: `Test sent to ${testers.map((t) => t.name).join(", ")}. Check your phone.` };
}

/**
 * Sends this campaign's held-back messages (Meta error 131049/130472) once more right away,
 * instead of waiting for the automatic retry. Same rules as a normal send.
 */
export async function retryHeldBackNow(campaignId: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } });
  if (!c || !mine(s, c.clientId)) return { ok: false, message: "Campaign not found." };
  const r = await retryHeldBack({ campaignId, ignoreWait: true });
  refresh();
  if (!r.retried && !r.failed) {
    return { ok: false, message: r.waiting.length ? `Nothing sent yet: ${[...new Set(r.waiting)].join(", ")}. The scheduler will try again.` : "No held-back messages are waiting for a retry." };
  }
  return {
    ok: true,
    message: `Retried ${r.retried + r.failed}: ${r.retried} sent${r.failed ? `, ${r.failed} failed again` : ""}.`,
  };
}

/** The business a campaign form works for: the campaign's own, else the one open now. Null when not allowed. */
async function formClient(campaignId: string | null) {
  const s = await requireManager();
  if ("denied" in s) return null;
  if (!campaignId) return s.clientId ?? null;
  const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } });
  return c && mine(s, c.clientId) ? c.clientId : null;
}

/**
 * Who a campaign form's choices reach right now: how many customers ("Send to", plus people added, minus people left
 * out), how many of them didn't open their last offers, and the test numbers (tagged "test") still in it.
 */
export async function countCampaignAudience(
  campaignId: string | null,
  audienceTag: string,
  people: { includeIds?: string[]; excludeIds?: string[] } = {},
): Promise<{ ok: boolean; n: number; unread?: number; testIds?: string[] }> {
  const clientId = await formClient(campaignId);
  if (!clientId) return { ok: false, n: 0 };
  const where = await campaignAudienceWhere(clientId, audienceTag.trim() || null, {
    includeIds: await ownCustomers(clientId, people.includeIds),
    excludeIds: await ownCustomers(clientId, people.excludeIds),
  });
  const [n, tests, unread] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where: { AND: [where, { tags: { has: TEST_TAG } }] }, select: { id: true }, take: 50 }),
    notOpeningOffers(clientId),
  ]);
  const unreadIn = unread.size ? await db.customer.count({ where: { AND: [where, { id: { in: [...unread] } }] } }) : 0;
  return { ok: true, n, unread: unreadIn, testIds: tests.map((t) => t.id) };
}

/** Customers matching a name or number, to add to a campaign or leave out of it (at most 8). */
export async function searchCampaignCustomers(campaignId: string | null, q: string): Promise<{ id: string; name: string; phone: string; tags: string[] }[]> {
  const clientId = await formClient(campaignId);
  const text = q.trim().slice(0, 60);
  if (!clientId || text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  return db.customer.findMany({
    where: { clientId, OR: [{ name: { contains: text, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] },
    select: { id: true, name: true, phone: true, tags: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

export async function cancelRun(runId: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const run = await db.campaignRun.findUnique({ where: { id: runId }, select: { campaign: { select: { clientId: true } } } });
  if (!run || !mine(s, run.campaign.clientId)) return { ok: false, message: "Run not found." };
  const skipped = await db.message.updateMany({
    where: { runId, status: "QUEUED" },
    data: { status: "SKIPPED", error: "Run stopped from dashboard" },
  });
  await db.campaignRun.update({ where: { id: runId }, data: { status: "CANCELLED", completedAt: new Date() } });
  refresh();
  return { ok: true, message: `Stopped. ${skipped.count} queued messages won't be sent.` };
}

export async function duplicateCampaign(id: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || !mine(s, c.clientId)) return { ok: false, message: "Campaign not found." };
  const duplicated = await db.campaign.create({
    data: {
      clientId: c.clientId,
      name: `${c.name} (copy)`,
      templateId: c.templateId,
      senderId: c.senderId,
      audienceTag: c.audienceTag,
      scheduleType: c.scheduleType,
      daysOfWeek: c.daysOfWeek,
      sendTime: c.sendTime,
      runAt: null,
      timezone: c.timezone,
      batchSize: c.batchSize,
      intervalMinutes: c.intervalMinutes,
      includeIds: c.includeIds,
      excludeIds: c.excludeIds,
      skipUnread: c.skipUnread,
      active: false,
      nextRunAt: null,
    },
  });
  refresh();
  return { ok: true, id: duplicated.id, message: "Copy saved as a draft." };
}

export async function runDispatcherNow(): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await dispatch();
  refresh();
  return { ok: true, message: `Scheduler ran: ${r.campaignsStarted} campaigns started, ${r.sent} sent, ${r.failed} failed.` };
}

