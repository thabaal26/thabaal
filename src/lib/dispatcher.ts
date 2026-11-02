import "server-only";
import type { Campaign } from "@prisma/client";
import { backfillCustomerNames } from "./customer-name";
import { db } from "./db";
import { pushToGoogleSheet } from "./google-sheets-live";
import { computeNextRun } from "./schedule";
import { fmtDate } from "./format";
import { deliver, getSettings, isSimulated, readiness, templateSendable } from "./provider";
import { allowance, refreshStaleNumbers, windowFreesAt } from "./limits";
import { marketingPaused } from "./held";
import { explainError, metaError, PAUSING_KINDS } from "./meta-errors";
import { applyFailure, quietUntil, recentlyMarketed } from "./rules";
import { sendRefillReminders } from "./refill";
import { lockedClientIds } from "./plan-access";
import { syncDueSheets } from "./sheets";
import { syncAllSheets } from "./gsheet/sync";
import { processOwnerMessages, queueAutoReminders } from "./owner-messages";
import { planCapacityBlock } from "./subscription";
import { campaignAudienceWhere } from "./audiences";
import { refreshLifecycleTags, sendWinbacks } from "./lifecycle";
import { backfillOrderNames } from "./orders";
import { remindUnpaidOrders } from "./payments";
import { expireUnfinishedOrders, nudgeUnfinishedOrders } from "./cart-followups";
import { busyForOffers } from "./order-assistant";
import { senderFor } from "./senders";
import { WahaError } from "./waha";
import { MetaError } from "./whatsapp";
import { normalizePhone } from "./phone";
import { affordableMessages } from "./wallet";
import { notOpeningOffers, UNREAD_OFFERS } from "./engagement";

const TIME_BUDGET_MS = 50_000; // stay under Vercel's function limit
const KICK_BUDGET_MS = 40_000; // a kick runs after a webhook's answer, inside the same function
const KICK_GAP_MS = 60_000; // at most one kick a minute per server instance
/** A late scheduler call sends the batches it missed, up to this many at once (still within Meta's daily limit). */
const MAX_CATCH_UP = 12;
const CONCURRENCY = 10;
const LOCAL_GAP_MS = [1_000, 3_000]; // random pause between local-session sends

/** Creates a run and queues one message per eligible customer. */
export async function startRun(campaign: Campaign & { template: { name: string } }, scheduledFor: Date) {
  const customers = await db.customer.findMany({ where: await campaignAudienceWhere(campaign.clientId, campaign.audienceTag, campaign), select: { id: true } });
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

export async function startDueCampaigns(now: Date, paused: ReadonlySet<string>, only?: readonly string[]) {
  const due = await db.campaign.findMany({
    // Businesses locked for an unpaid plan: their scheduled campaigns wait (and start once they pay).
    where: { active: true, nextRunAt: { lte: now }, clientId: { notIn: [...paused], ...(only && { in: [...only] }) } },
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
    // The plan's campaign sends for this month are used up: this send is skipped (the next one is still scheduled).
    const block = await planCapacityBlock(c.clientId, "camp", now).catch(() => null);
    if (block) {
      console.warn(`Campaign ${c.id} skipped: ${block}`);
      continue;
    }
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
  // The scheduler is often late (GitHub runs its "every 5 minutes" every 30 to 80): the batches due since are sent now,
  // so a campaign keeps its pace instead of one batch per call.
  const behind = run.nextBatchAt ? Math.floor((now.getTime() - run.nextBatchAt.getTime()) / (campaign.intervalMinutes * 60_000)) + 1 : 1;
  const batches = Math.min(MAX_CATCH_UP, Math.max(1, behind));

  type Wait = "WAITING_TEMPLATE" | "WAITING_CONNECTION" | "WAITING_LIMIT" | "WAITING_QUALITY" | "WAITING_QUIET" | "WAITING_FUNDS";
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
  const ready = await readiness(settings, cfg);
  if (!ready.ok) {
    // A client that hasn't connected its own number waits longer: it needs an admin, not a retry.
    await pause("WAITING_CONNECTION", ready.notConnected ? 30 : 2);
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
  let take = campaign.batchSize * batches;
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
  // Thabaal-wallet clients: send only what their balance can pay for; wait for a recharge otherwise.
  const affordable = await affordableMessages(campaign.clientId, t.category);
  if (affordable <= 0) {
    await pause("WAITING_FUNDS", 30);
    return { sent: 0, failed: 0 };
  }
  take = Math.min(take, affordable);
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
  // No offers for someone in the middle of an order, with a problem open, or who asked for none.
  const busy = marketing ? await busyForOffers(batch.map((m) => m.customerId)) : new Map<string, string>();
  // The campaign leaves out people who didn't open their last offers (lib/engagement.ts), when it says so.
  const unread = marketing && campaign.skipUnread ? await notOpeningOffers(campaign.clientId, batch.map((m) => m.customerId)) : new Set<string>();

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
    const senderDigits = number?.displayPhone ? normalizePhone(number.displayPhone) : null;
    if (senderDigits && senderDigits === m.customer.phone) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: "Recipient is the sending WhatsApp number itself" } });
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
    if (unread.has(m.customerId)) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: `Didn't open the last ${UNREAD_OFFERS} offers` } });
      return;
    }
    const why = busy.get(m.customerId);
    if (why) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: why } });
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
      pushToGoogleSheet(campaign.clientId, "CAMPAIGN_STATUS", {
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
      pushToGoogleSheet(campaign.clientId, "CAMPAIGN_STATUS", {
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

/** Due campaign runs: each sends what is due now. Safe to call concurrently (every run and batch is claimed first). */
async function processDueRuns(now: Date, deadline: number, paused: ReadonlySet<string>, only?: readonly string[]) {
  const runs = await db.campaignRun.findMany({
    where: {
      status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"] },
      nextBatchAt: { lte: now },
      campaign: { clientId: { notIn: [...paused], ...(only && { in: [...only] }) } },
    },
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
  return { runs: runs.length, sent, failed };
}

/** Businesses locked for an unpaid plan (lib/plan-access.ts): nothing goes out for them until they pay. */
const lockedNow = (now: Date) =>
  lockedClientIds(now).catch((e) => {
    console.error("Could not read plan locks", e);
    return new Set<string>();
  });

/**
 * Campaigns only: starts the due ones and sends what is due on running ones (the scheduler's campaign part).
 * `only` limits it to some businesses (tests share one database).
 */
export async function runDueCampaigns(now = new Date(), budgetMs = KICK_BUDGET_MS, only?: readonly string[]) {
  const paused = await lockedNow(now);
  const started = await startDueCampaigns(now, paused, only);
  // Read the clock again: a run started just now is due now, and sends its first batch in this same call.
  const r = await processDueRuns(new Date(), Date.now() + budgetMs, paused, only);
  return { campaignsStarted: started, runsProcessed: r.runs, sent: r.sent, failed: r.failed };
}

let lastKick = 0;

/**
 * Campaigns between scheduler calls, started from WhatsApp's webhook (message statuses and replies come in all day):
 * at most once a minute per server instance, so a due campaign or its next batch doesn't wait for the scheduler.
 * Null when it didn't run. Never throws.
 */
export async function kickCampaigns() {
  if (Date.now() - lastKick < KICK_GAP_MS) return null;
  lastKick = Date.now();
  return runDueCampaigns().catch((e) => {
    console.error("Campaign kick failed", e);
    return null;
  });
}

/** One tick of the scheduler. Safe to call often and concurrently. */
export async function dispatch() {
  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const now = new Date();

  const paused = await lockedNow(now);
  // Marketing-only businesses (Orders switched off): no order-based messages (reorder, unpaid-order, win-back).
  const noOrders = new Set(paused);
  for (const c of await db.client.findMany({ where: { disabledSections: { has: "orders" } }, select: { id: true } }).catch(() => [])) noOrders.add(c.id);
  const campaignsStarted = await startDueCampaigns(now, paused);
  await refreshStaleNumbers().catch((e) => console.error("Could not refresh number status", e));
  // A run started just now is due now (its first batch goes in this same call, not the next one).
  const { runs, sent, failed } = await processDueRuns(new Date(), deadline, paused);
  if (Date.now() < deadline) await sendRefillReminders(now, noOrders).catch((e) => console.error("Refill reminders failed", e));
  if (Date.now() < deadline) await syncDueSheets(now).catch((e) => console.error("Sheet sync failed", e));
  // Connected Google Sheets (lib/gsheet): anything a live update missed.
  if (Date.now() < deadline) await syncAllSheets(deadline).catch((e) => console.error("Google Sheet live sync failed", e));
  if (Date.now() < deadline) await backfillOrderNames().catch((e) => console.error("Order name backfill failed", e));
  if (Date.now() < deadline) await backfillCustomerNames().catch((e) => console.error("Customer name backfill failed", e));
  if (Date.now() < deadline) await expireUnfinishedOrders(now, noOrders).catch((e) => console.error("Order expiry failed", e));
  if (Date.now() < deadline) await nudgeUnfinishedOrders(now, noOrders).catch((e) => console.error("Order nudges failed", e));
  if (Date.now() < deadline) await remindUnpaidOrders(now, 20, noOrders).catch((e) => console.error("Payment reminders failed", e));
  if (Date.now() < deadline) await refreshLifecycleTags().catch((e) => console.error("Lifecycle tags failed", e));
  if (Date.now() < deadline) await sendWinbacks(now, noOrders).catch((e) => console.error("Win-back failed", e));
  // Messages from Thabaal to business owners (admin › Messages): automatic payment reminders, then anything due.
  if (Date.now() < deadline) await queueAutoReminders(now).catch((e) => console.error("Owner reminders failed", e));
  if (Date.now() < deadline) await processOwnerMessages(now, deadline).catch((e) => console.error("Owner messages failed", e));
  await db.setting.upsert({ where: { id: 1 }, update: { lastDispatchAt: now }, create: { id: 1, lastDispatchAt: now } });
  return { campaignsStarted, runsProcessed: runs, sent, failed, ms: Date.now() - startedAt };
}
