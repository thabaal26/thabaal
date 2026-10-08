"use server";

import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dispatch, startRun } from "@/lib/dispatcher";
import { APP_TZ } from "@/lib/format";
import { getSettings, templateSendable } from "@/lib/provider";
import { isQuietTime } from "@/lib/rules";
import { computeNextRun } from "@/lib/schedule";
import { senderFor } from "@/lib/senders";
import { requireAdmin } from "@/lib/session";
import type { ActionResult } from "./templates";

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
};

function refresh() {
  revalidatePath("/dashboard", "layout");
}

export async function saveCampaign(id: string | null, input: CampaignInput): Promise<ActionResult> {
  const s = id ? await requireAdmin() : await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = id ? await db.campaign.findUnique({ where: { id }, select: { clientId: true } }) : null;
  if (id && !existing) return { ok: false, message: "Campaign not found." };
  const clientId = existing?.clientId ?? s.clientId!;

  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Give the campaign a name.");
  const template = await db.template.findUnique({ where: { id: input.templateId, clientId } });
  if (!template) errors.push("Choose a template.");
  else if (template.category === "AUTHENTICATION") errors.push("Authentication templates can't be used in campaigns.");
  const { number: sender } = await senderFor(clientId, input.senderId || null);
  if (input.senderId && sender?.id !== input.senderId) errors.push("Choose a number to send from.");
  if (template && sender && template.businessAccountId && template.businessAccountId !== sender.businessAccountId)
    errors.push(`"${template.name}" is approved in a different WhatsApp account than ${sender.label}. Pick a template from that number's account.`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime)) errors.push("Choose a send time.");
  if (input.scheduleType === "WEEKLY" && !input.daysOfWeek.length) errors.push("Pick at least one day of the week.");
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

  const data = {
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
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) return { ok: false, message: "Campaign not found." };
  const nextRunAt = active ? computeNextRun(c) : null;
  if (active && !nextRunAt) return { ok: false, message: "Nothing left to schedule. Edit the date or days first." };
  await db.campaign.update({ where: { id }, data: { active, nextRunAt } });
  refresh();
  return { ok: true, message: active ? "Campaign resumed." : "Campaign paused." };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  await db.message.deleteMany({ where: { run: { campaignId: id }, status: "QUEUED" } });
  await db.campaign.delete({ where: { id } });
  refresh();
  return { ok: true, message: "Campaign deleted. Sent messages stay in the log." };
}

export async function runCampaignNow(id: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.campaign.findUnique({ where: { id }, include: { template: true } });
  if (!c) return { ok: false, message: "Campaign not found." };
  if (!templateSendable(await getSettings(), c.template)) return { ok: false, message: "The template isn't approved by Meta yet." };
  const busy = await db.campaignRun.findFirst({ where: { campaignId: id, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"] } } });
  if (busy) return { ok: false, message: "This campaign is already sending. Wait for it to finish or stop it." };
  const run = await startRun(c, new Date());
  await dispatch();
  refresh();
  return { ok: true, message: `Started: ${run.total} customers queued, ${c.batchSize} every ${c.intervalMinutes} min.` };
}

export async function cancelRun(runId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const skipped = await db.message.updateMany({
    where: { runId, status: "QUEUED" },
    data: { status: "SKIPPED", error: "Run stopped from dashboard" },
  });
  await db.campaignRun.update({ where: { id: runId }, data: { status: "CANCELLED", completedAt: new Date() } });
  refresh();
  return { ok: true, message: `Stopped. ${skipped.count} queued messages won't be sent.` };
}

export async function runDispatcherNow(): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await dispatch();
  refresh();
  return { ok: true, message: `Scheduler ran: ${r.campaignsStarted} campaigns started, ${r.sent} sent, ${r.failed} failed.` };
}
