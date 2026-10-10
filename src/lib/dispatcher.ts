import "server-only";
import type { Campaign } from "@prisma/client";
import { db } from "./db";
import { pushToGoogleSheet } from "./google-sheets-live";
import { computeNextRun } from "./schedule";
import { fmtDate } from "./format";
import { deliver, getSettings, isSimulated, readiness, templateSendable } from "./provider";
import { allowance, refreshStaleNumbers, windowFreesAt } from "./limits";
import { marketingPaused, retryHeldBack } from "./held";
import { explainError, metaError, PAUSING_KINDS } from "./meta-errors";
import { applyFailure, quietUntil, recentlyMarketed } from "./rules";
import { sendRefillReminders } from "./refill";
import { syncDueSheets } from "./sheets";
import { campaignAudienceWhere } from "./audiences";
import { refreshLifecycleTags, sendWinbacks } from "./lifecycle";
import { backfillOrderNames } from "./orders";
import { remindUnpaidOrders } from "./payments";
import { senderFor } from "./senders";
import { WahaError } from "./waha";
import { MetaError } from "./whatsapp";

const TIME_BUDGET_MS = 50_000; // stay under Vercel's function limit
const CONCURRENCY = 10;
const LOCAL_GAP_MS = [1_000, 3_000]; // random pause between local-session sends

/** Creates a run and queues one message per eligible customer. */
export async function startRun(campaign: Campaign & { template: { name: string } }, scheduledFor: Date) {
  const customers = await db.customer.findMany({ where: await campaignAudienceWhere(campaign.clientId, campaign.audienceTag), select: { id: true } });
  const run = await db.campaignRun.create({
    data: { campaignId: campaign.id, scheduledFor, total: customers.length, nextBatchAt: new Date() },
  });
  if (customers.length) {
    await db.message.createMany({
      data: customers.map((c) => ({
        runId: run.id,
        customerId: c.id,
        templateId: campaign.templateId,
        templateName: campaign.template.name,
      })),
    });
  } else {
    await db.campaignRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  }
  return run;
}

async function startDueCampaigns(now: Date) {
  const due = await db.campaign.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    include: { template: { select: { name: true } } },
  });
  let started = 0;
  for (const c of due) {
    const next = computeNextRun(c, now);
    // Claim the slot so overlapping cron calls cannot start the same run twice.
    const claimed = await db.campaign.updateMany({
      where: { id: c.id, nextRunAt: c.nextRunAt },
      data: { nextRunAt: next, active: next !== null },
    });
    if (!claimed.count) continue;
    try {
      await startRun(c, c.nextRunAt!);
      started++;
    } catch (e) {
      console.error(`Could not start campaign ${c.id}`, e);
    }
  }
  return started;
}

async function inPool<T>(items: T[], size: number, fn: (item: T) => Promise<boolean | void>) {
  for (let i = 0; i < items.length; i += size) {
    const results = await Promise.all(items.slice(i, i + size).map(fn));
    if (results.includes(false)) return; // a worker asked to stop the batch
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors that mean the local session is offline, not that this one number failed. */
function sessionDown(e: unknown) {
  return e instanceof WahaError && (!e.status || e.status === 422 || e.status >= 500);
}

async function processRun(runId: string, now: Date, deadline: number) {
  const run = await db.campaignRun.findUnique({
    where: { id: runId },
    include: { campaign: { include: { template: true, client: { select: { name: true, marketingGapHours: true, quietFrom: true, quietTo: true } } } } },
  });
  if (!run) return { sent: 0, failed: 0 };
  const { campaign } = run;

  const claimed = await db.campaignRun.updateMany({
    where: { id: run.id, nextBatchAt: run.nextBatchAt },
    data: { nextBatchAt: new Date(now.getTime() + campaign.intervalMinutes * 60_000) },
  });
  if (!claimed.count) return { sent: 0, failed: 0 };

  type Wait = "WAITING_TEMPLATE" | "WAITING_CONNECTION" | "WAITING_LIMIT" | "WAITING_QUALITY" | "WAITING_QUIET";
  const pauseUntil = (status: Wait, at: Date) => db.campaignRun.update({ where: { id: run.id }, data: { status, nextBatchAt: at } });
  const pause = (status: Wait, minutes: number) => pauseUntil(status, new Date(Date.now() + minutes * 60_000));

  // Always the latest saved version, so template edits reach the next batch.
  const t = campaign.template;
  const settings = await getSettings();
  const { number, cfg } = await senderFor(campaign.clientId, campaign.senderId);
  // Meta only sends a template from numbers in the account that approved it.
  const wrongAccount = settings.provider === "META" && t.businessAccountId && number && t.businessAccountId !== number.businessAccountId;
  if (!templateSendable(settings, t) || wrongAccount) {
    await pause("WAITING_TEMPLATE", 5);
    return { sent: 0, failed: 0 };
  }
  if (!(await readiness(settings, cfg)).ok) {
    await pause("WAITING_CONNECTION", 2);
    return { sent: 0, failed: 0 };
  }
  // Offers at night get reported; hold marketing until quiet hours end.
  const marketing = t.category === "MARKETING";
  const resumeAt = marketing ? quietUntil(campaign.client, new Date()) : null;
  if (resumeAt) {
    await pauseUntil("WAITING_QUIET", resumeAt);
    return { sent: 0, failed: 0 };
  }
  // Respect Meta's 24-hour messaging limit and stop if the number's quality turns red.
  let take = campaign.batchSize;
  if (settings.provider === "META" && number && cfg.live) {
    if (number.qualityRating === "RED") {
      await pause("WAITING_QUALITY", 60);
      return { sent: 0, failed: 0 };
    }
    const a = await allowance(number);
    if (!a.unlimited) {
      if (a.left <= 0) {
        const ids = (await db.whatsAppNumber.findMany({ where: { clientId: number.clientId }, select: { id: true } })).map((x) => x.id);
        await pauseUntil("WAITING_LIMIT", await windowFreesAt(number.dailyCap != null ? [number.id] : ids));
        return { sent: 0, failed: 0 };
      }
      take = Math.min(take, a.left);
    }
  }
  if (run.status !== "RUNNING") await db.campaignRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });

  const batch = await db.message.findMany({
    where: { runId: run.id, status: "QUEUED" },
    include: { customer: true },
    take,
    orderBy: { id: "asc" },
  });

  // Customers who got any marketing message recently are skipped, so nobody is flooded with offers.
  const recent = marketing ? await recentlyMarketed(batch.map((m) => m.customerId), campaign.client.marketingGapHours) : new Map<string, Date>();
  // Meta recently held marketing back from these customers; another offer now would only be held again.
  const paused = marketing ? await marketingPaused(batch.map((m) => m.customerId)) : new Map<string, Date>();

  // The local session sends one by one with human-like gaps; Meta can take parallel sends.
  const local = settings.provider === "LOCAL" && !isSimulated(settings, cfg);
  let sent = 0;
  let failed = 0;
  let outOfTime = false;
  let disconnected = false;
  let throttled = false;
  let restricted = false;
  let setupProblem = false;

  await inPool(batch, local ? 1 : CONCURRENCY, async (m) => {
    if (Date.now() > deadline) {
      outOfTime = true; // stays QUEUED for the next call
      return false;
    }
    if (throttled || restricted || setupProblem) return false;
    if (m.customer.optedOut || m.customer.unreachable) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: m.customer.optedOut ? "Customer opted out" : "Number can't receive WhatsApp messages" } });
      return;
    }
    const until = paused.get(m.customerId);
    if (until) {
      await db.message.update({
        where: { id: m.id },
        data: { status: "SKIPPED", error: `Meta is holding back marketing to this customer until about ${fmtDate(until, "d MMM")}` },
      });
      return;
    }
    const last = recent.get(m.customerId);
    if (last) {
      await db.message.update({
        where: { id: m.id },
        data: { status: "SKIPPED", error: `Already got an offer within ${campaign.client.marketingGapHours} hours (last ${fmtDate(last, "d MMM, h:mm a")})` },
      });
      return;
    }
    try {
      const res = await deliver(settings, t, m.customer, cfg);
      await db.message.update({
        where: { id: m.id },
        data: {
          status: "SENT",
          error: null,
          errorCode: null,
          waMessageId: res.id,
          simulated: res.simulated,
          provider: res.provider,
          body: res.text,
          templateName: t.name,
          senderId: settings.provider === "META" ? (number?.id ?? null) : null,
          sentAt: new Date(),
        },
      });
      sent++;
      pushToGoogleSheet("CAMPAIGN_STATUS", {
        campaign: t.name,
        phone: m.customer.phone,
        status: "SENT",
        waMessageId: res.id,
        client: campaign.client.name || "Thabaal",
      });
    } catch (e) {
      if (sessionDown(e)) {
        disconnected = true;
        return false;
      }
      const code = e instanceof MetaError ? (e.code ?? null) : null;
      const kind = metaError(code)?.kind;
      // Too fast, or Meta briefly down: leave it queued and try again shortly.
      if (kind === "rate" || kind === "temporary") {
        throttled = true;
        return false;
      }
      // Token, permissions, billing or registration: every send would fail the same way, so keep the
      // message queued (noting why, for the Overview warning) and pause the run until it's fixed.
      if (kind && PAUSING_KINDS.includes(kind)) {
        setupProblem = true;
        await db.message.update({ where: { id: m.id }, data: { errorCode: code, error: explainError(code, e instanceof Error ? e.message : String(e)) } });
        return false;
      }
      // Restricted number: fail this one and stop the whole run.
      if (kind === "number-restricted") restricted = true;
      await db.message.update({
        where: { id: m.id },
        data: {
          status: "FAILED",
          provider: settings.provider,
          errorCode: code,
          error: explainError(code, e instanceof Error ? e.message : String(e)),
          failedAt: new Date(),
        },
      });
      await applyFailure(m.customerId, code);
      failed++;
      pushToGoogleSheet("CAMPAIGN_STATUS", {
        campaign: t.name,
        phone: m.customer.phone,
        status: "FAILED",
        waMessageId: "",
        client: campaign.client.name || "Thabaal",
      });
    }
    if (local) await sleep(LOCAL_GAP_MS[0] + Math.random() * (LOCAL_GAP_MS[1] - LOCAL_GAP_MS[0]));
  });

  if (disconnected) await pause("WAITING_CONNECTION", 2);
  else if (setupProblem) await pause("WAITING_CONNECTION", 30);
  else if (restricted) await pause("WAITING_QUALITY", 6 * 60);
  else if (throttled) await db.campaignRun.update({ where: { id: run.id }, data: { nextBatchAt: new Date(Date.now() + 5 * 60_000) } });
  // Finish the rest of this batch on the next scheduler call instead of waiting a full interval.
  else if (outOfTime) await db.campaignRun.update({ where: { id: run.id }, data: { nextBatchAt: new Date() } });

  const left = await db.message.count({ where: { runId: run.id, status: "QUEUED" } });
  if (!left) await db.campaignRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  return { sent, failed };
}

/** One tick of the scheduler. Safe to call often and concurrently. */
export async function dispatch() {
  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const now = new Date();

  const campaignsStarted = await startDueCampaigns(now);
  await refreshStaleNumbers().catch((e) => console.error("Could not refresh number status", e));
  const runs = await db.campaignRun.findMany({
    where: { status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"] }, nextBatchAt: { lte: now } },
    select: { id: true },
    orderBy: { nextBatchAt: "asc" },
    take: 20,
  });

  let sent = 0;
  let failed = 0;
  for (const r of runs) {
    if (Date.now() > deadline) break;
    const res = await processRun(r.id, now, deadline);
    sent += res.sent;
    failed += res.failed;
  }
  // Messages Meta held back a few days ago get their one retry.
  if (Date.now() < deadline) await retryHeldBack({ now, deadline }).catch((e) => console.error("Held-back retries failed", e));
  if (Date.now() < deadline) await sendRefillReminders(now).catch((e) => console.error("Refill reminders failed", e));
  if (Date.now() < deadline) await syncDueSheets(now).catch((e) => console.error("Sheet sync failed", e));
  if (Date.now() < deadline) await backfillOrderNames().catch((e) => console.error("Order name backfill failed", e));
  if (Date.now() < deadline) await remindUnpaidOrders(now).catch((e) => console.error("Payment reminders failed", e));
  if (Date.now() < deadline) await refreshLifecycleTags().catch((e) => console.error("Lifecycle tags failed", e));
  if (Date.now() < deadline) await sendWinbacks(now).catch((e) => console.error("Win-back failed", e));
  await db.setting.upsert({ where: { id: 1 }, update: { lastDispatchAt: now }, create: { id: 1, lastDispatchAt: now } });
  return { campaignsStarted, runsProcessed: runs.length, sent, failed, ms: Date.now() - startedAt };
}
