import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { audienceTagCustomerIds, campaignAudienceWhere } from "./audiences";
import { HELD_CODES, SKIP_CODES, SKIP_DAYS, RETRY_AFTER_HOURS, RETRY_UNTIL_DAYS } from "./held";
import { getMetaErrorClassification } from "./meta-errors";
import { normalizePhone, readPhones } from "./phone";

import { CLASSIFICATION_DEFINITIONS, type ClassificationMeta, type DimensionType } from "./campaign-classification-meta";
export { CLASSIFICATION_DEFINITIONS, type ClassificationMeta, type DimensionType };

export type AudienceClassificationSummary = {
  // 7 Critical Separation Counts
  totalAudience: number;
  selectedAudience: number;
  eligibleNow: number;
  temporarilyHeld: number;
  permanentlyExcluded: number;
  retryAvailable: number;
  finalDispatchable: number;

  // Breakdown by 4 Independent Dimensions
  historyCounts: Record<string, number>;
  eligibilityCounts: Record<string, number>;
  engagementCounts: Record<string, number>;
  lifecycleCounts: Record<string, number>;
};

/**
 * Computes the complete multi-dimensional customer classification breakdown for a campaign audience.
 * Strictly tenant-scoped with parameter-safe batch processing.
 */
export async function getAudienceClassificationSummary(
  clientId: string,
  scope: {
    audienceTag?: string | null;
    templateId?: string;
    isMarketing?: boolean;
    now?: Date;
  } = {}
): Promise<AudienceClassificationSummary> {
  const now = scope.now ?? new Date();
  const customerIds = await audienceTagCustomerIds(clientId, scope.audienceTag);

  // Total tenant audience
  const totalTenantCustomers = await db.customer.count({
    where: { clientId, deletedAt: null },
  });

  // Base customer query for selected audience
  let selectedCustomers: {
    id: string;
    phone: string;
    optedOut: boolean;
    unreachable: boolean;
    optInAt: Date | null;
    optInSource: string | null;
    createdAt: Date;
    tags: string[];
  }[] = [];

  const CHUNK_SIZE = 2000;
  if (customerIds === null) {
    // Everyone mode
    selectedCustomers = await db.customer.findMany({
      where: { clientId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        optedOut: true,
        unreachable: true,
        optInAt: true,
        optInSource: true,
        createdAt: true,
        tags: true,
      },
    });
  } else if (customerIds.length === 0) {
    // Empty tag selection
    selectedCustomers = [];
  } else {
    // Tag-scoped selection with chunked queries
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const slice = customerIds.slice(i, i + CHUNK_SIZE);
      const batch = await db.customer.findMany({
        where: { id: { in: slice }, clientId, deletedAt: null },
        select: {
          id: true,
          phone: true,
          optedOut: true,
          unreachable: true,
          optInAt: true,
          optInSource: true,
          createdAt: true,
          tags: true,
        },
      });
      selectedCustomers.push(...batch);
    }
  }

  const selectedAudience = selectedCustomers.length;
  if (selectedAudience === 0) {
    return {
      totalAudience: totalTenantCustomers,
      selectedAudience: 0,
      eligibleNow: 0,
      temporarilyHeld: 0,
      permanentlyExcluded: 0,
      retryAvailable: 0,
      finalDispatchable: 0,
      historyCounts: Object.fromEntries(Object.keys(CLASSIFICATION_DEFINITIONS).filter(k => CLASSIFICATION_DEFINITIONS[k].dimension === "history").map(k => [k, 0])),
      eligibilityCounts: Object.fromEntries(Object.keys(CLASSIFICATION_DEFINITIONS).filter(k => CLASSIFICATION_DEFINITIONS[k].dimension === "eligibility").map(k => [k, 0])),
      engagementCounts: Object.fromEntries(Object.keys(CLASSIFICATION_DEFINITIONS).filter(k => CLASSIFICATION_DEFINITIONS[k].dimension === "engagement").map(k => [k, 0])),
      lifecycleCounts: Object.fromEntries(Object.keys(CLASSIFICATION_DEFINITIONS).filter(k => CLASSIFICATION_DEFINITIONS[k].dimension === "lifecycle").map(k => [k, 0])),
    };
  }

  // Determine template category
  let isMarketing = scope.isMarketing ?? true;
  if (scope.templateId) {
    const t = await db.template.findUnique({ where: { id: scope.templateId, clientId }, select: { category: true } });
    if (t) isMarketing = t.category === "MARKETING";
  }

  // Fetch campaign messages and order history for selected audience
  const selIds = selectedCustomers.map((c) => c.id);
  const msgMap = new Map<string, { status: string; errorCode: number | null; createdAt: Date; sentAt: Date | null; failedAt: Date | null }[]>();
  const orderCountMap = new Map<string, number>();
  const lastOrderDateMap = new Map<string, Date>();
  const replyMap = new Map<string, number>();

  for (let i = 0; i < selIds.length; i += CHUNK_SIZE) {
    const slice = selIds.slice(i, i + CHUNK_SIZE);
    const [msgs, orders, replies] = await Promise.all([
      db.message.findMany({
        where: { customerId: { in: slice }, runId: { not: null } },
        select: { customerId: true, status: true, errorCode: true, createdAt: true, sentAt: true, failedAt: true },
        orderBy: { createdAt: "desc" },
      }),
      db.order.findMany({
        where: { customerId: { in: slice }, clientId, status: { not: "CANCELLED" } },
        select: { customerId: true, createdAt: true },
      }),
      db.reply.findMany({
        where: { customerId: { in: slice }, customer: { clientId } },
        select: { customerId: true },
      }),
    ]);

    for (const m of msgs) {
      const list = msgMap.get(m.customerId) ?? [];
      list.push(m);
      msgMap.set(m.customerId, list);
    }
    for (const o of orders) {
      orderCountMap.set(o.customerId, (orderCountMap.get(o.customerId) ?? 0) + 1);
      const prev = lastOrderDateMap.get(o.customerId);
      if (!prev || o.createdAt > prev) lastOrderDateMap.set(o.customerId, o.createdAt);
    }
    for (const r of replies) {
      replyMap.set(r.customerId, (replyMap.get(r.customerId) ?? 0) + 1);
    }
  }

  // Deduplicate phones
  const seenPhones = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const c of selectedCustomers) {
    const p = normalizePhone(c.phone || "") || c.phone;
    if (p) {
      if (seenPhones.has(p)) {
        duplicateIds.add(c.id);
      } else {
        seenPhones.add(p);
      }
    }
  }

  const historyCounts: Record<string, number> = {};
  const eligibilityCounts: Record<string, number> = {};
  const engagementCounts: Record<string, number> = {};
  const lifecycleCounts: Record<string, number> = {};

  for (const [k, v] of Object.entries(CLASSIFICATION_DEFINITIONS)) {
    if (v.dimension === "history") historyCounts[k] = 0;
    else if (v.dimension === "eligibility") eligibilityCounts[k] = 0;
    else if (v.dimension === "engagement") engagementCounts[k] = 0;
    else if (v.dimension === "lifecycle") lifecycleCounts[k] = 0;
  }

  let eligibleNowCount = 0;
  let temporarilyHeldCount = 0;
  let permanentlyExcludedCount = 0;
  let retryAvailableCount = 0;
  let finalDispatchableCount = 0;

  const DAY_MS = 86_400_000;
  const HOUR_MS = 3_600_000;

  for (const c of selectedCustomers) {
    const msgs = msgMap.get(c.id) ?? [];
    const orders = orderCountMap.get(c.id) ?? 0;
    const replies = replyMap.get(c.id) ?? 0;
    const lastOrder = lastOrderDateMap.get(c.id) ?? null;

    // --- 1. History Classification ---
    if (!msgs.length) {
      historyCounts.FIRST_TIME_NEVER_SENT++;
    } else {
      historyCounts.PREVIOUSLY_ATTEMPTED++;
      const latest = msgs[0];
      if (latest.status === "READ") historyCounts.READ++;
      else if (latest.status === "DELIVERED") historyCounts.DELIVERED++;
      else if (latest.status === "SENT") historyCounts.SENT_AWAITING_DELIVERY++;
      else if (latest.status === "FAILED") {
        historyCounts.FAILED++;
        if (latest.errorCode === 131049 && latest.failedAt) {
          const ageHours = (now.getTime() - latest.failedAt.getTime()) / HOUR_MS;
          if (ageHours < RETRY_AFTER_HOURS) {
            historyCounts.RETRY_PENDING++;
          } else if (ageHours <= RETRY_UNTIL_DAYS * 24) {
            historyCounts.RETRY_AVAILABLE++;
            retryAvailableCount++;
          } else {
            historyCounts.RETRY_EXPIRED++;
          }
        } else {
          historyCounts.RETRY_NOT_ALLOWED++;
        }
      } else if (latest.status === "SKIPPED") {
        historyCounts.SKIPPED++;
      }
    }

    // --- 2. Current Eligibility Classification ---
    const { phones } = readPhones(c.phone);
    const hasValidPhone = phones && phones.length > 0 && phones[0].length >= 10;
    const isDuplicate = duplicateIds.has(c.id);
    const hasConsent = Boolean(c.optInAt && c.optInSource && c.optInSource.trim().length > 0);

    let isTemporarilyHeld = false;
    let isPermanentlyExcluded = false;

    if (c.optedOut) {
      eligibilityCounts.OPTED_OUT++;
      isPermanentlyExcluded = true;
    } else if (c.unreachable) {
      eligibilityCounts.UNREACHABLE++;
      isPermanentlyExcluded = true;
    } else if (!hasValidPhone) {
      eligibilityCounts.INVALID_PHONE++;
      isPermanentlyExcluded = true;
    } else if (isDuplicate) {
      eligibilityCounts.DUPLICATE_CONFLICT++;
      isPermanentlyExcluded = true;
    } else if (isMarketing && !hasConsent) {
      eligibilityCounts.CONSENT_MISSING_UNVERIFIED++;
      isPermanentlyExcluded = true;
    }

    // Check Meta skip/hold window
    if (!isPermanentlyExcluded && msgs.length > 0) {
      const heldMsg = msgs.find(
        (m) => m.status === "FAILED" && m.errorCode && SKIP_CODES.includes(m.errorCode) && m.failedAt && now.getTime() - m.failedAt.getTime() < SKIP_DAYS * DAY_MS
      );
      if (heldMsg) {
        eligibilityCounts.TEMPORARY_HOLD++;
        isTemporarilyHeld = true;
      }
    }

    if (isPermanentlyExcluded) {
      permanentlyExcludedCount++;
    } else if (isTemporarilyHeld) {
      temporarilyHeldCount++;
    } else {
      eligibilityCounts.ELIGIBLE_NOW++;
      eligibleNowCount++;
      finalDispatchableCount++;
    }

    // --- 3. Engagement Classification ---
    if (replies > 0 || orders > 0) {
      engagementCounts.ENGAGED++;
    } else if (msgs.some((m) => m.status === "READ")) {
      engagementCounts.READ_SEEN++;
    } else if (msgs.some((m) => m.status === "DELIVERED")) {
      const deliveredCount = msgs.filter((m) => m.status === "DELIVERED").length;
      if (deliveredCount >= 3) {
        engagementCounts.DORMANT++;
      } else {
        engagementCounts.DELIVERED_NO_ENGAGEMENT++;
      }
    } else {
      engagementCounts.UNKNOWN_NO_EVIDENCE++;
    }

    // --- 4. Customer Lifecycle Classification ---
    if (orders === 0) {
      lifecycleCounts.NO_RECORDED_PURCHASE++;
      if (now.getTime() - c.createdAt.getTime() <= 30 * DAY_MS) {
        lifecycleCounts.NEW_CUSTOMER++;
      }
    } else {
      lifecycleCounts.HAS_PURCHASE_HISTORY++;
      if (orders >= 2) {
        lifecycleCounts.REPEAT_CUSTOMER++;
      }
      if (lastOrder && now.getTime() - lastOrder.getTime() > 60 * DAY_MS) {
        lifecycleCounts.LAPSED_CUSTOMER++;
      }
    }
  }

  return {
    totalAudience: totalTenantCustomers,
    selectedAudience,
    eligibleNow: eligibleNowCount,
    temporarilyHeld: temporarilyHeldCount,
    permanentlyExcluded: permanentlyExcludedCount,
    retryAvailable: retryAvailableCount,
    finalDispatchable: finalDispatchableCount,
    historyCounts,
    eligibilityCounts,
    engagementCounts,
    lifecycleCounts,
  };
}
