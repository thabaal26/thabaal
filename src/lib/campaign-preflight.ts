import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { audienceWhere, campaignAudienceWhere, type AudienceFilter } from "./audiences";
import { AUDIENCE_PREFIX, decodeTags } from "./audience-tags";
import { senderFor } from "./senders";
import { unmappedVars, type VarMap } from "./template";
import { isQuietTime, recentlyMarketed } from "./rules";
import { planCapacityBlock } from "./subscription";
import { canSendLiveOutbound } from "./workspace-guard";
import { resolveTenantReadiness } from "./tenant-activation";
import { readPhones, normalizePhone } from "./phone";
import { cleanSegments } from "./engagement-segments";
import { SKIP_CODES, SKIP_DAYS } from "./held";
import { INACTIVE_TAG, TEST_TAG } from "./schedule";
import { notOpeningOffers } from "./engagement";

export type CampaignPreflightStatus = "READY_FOR_MANUAL_LAUNCH" | "CONDITIONAL_GO" | "NO_GO";

export type CampaignPreflightResult = {
  ok: boolean;
  status: CampaignPreflightStatus;
  campaignId: string;
  campaignName: string;
  clientId: string;
  clientName: string;
  template: {
    id: string;
    name: string;
    category: string;
    language: string;
    status: string;
    isApproved: boolean;
    unmappedVariables: string[];
  };
  sender: {
    id: string | null;
    displayPhone: string | null;
    qualityRating: string | null;
    messagingTier: string | null;
    isOwnedByTenant: boolean;
    hasActiveConnection: boolean;
  };
  entitlement: {
    workspaceMode: string;
    hasActiveSubscription: boolean;
    isSuspended: boolean;
    canSendLiveOutbound: boolean;
    reason?: string;
  };
  recipients: {
    totalTenantCustomers: number;
    matchingAudienceInput: number;
    consentVerified: number;
    consentUnverified: number;
    eligibleCount: number;
    excludedOptOut: number;
    excludedUnreachable: number;
    excludedDeleted: number;
    excludedInvalidPhone: number;
    excludedDuplicate: number;
    excludedConsentUnverified: number;
    excludedRecentlyMarketed: number;
    excludedHandPicked: number;
    quietHourExclusions: number;
    breakdown: { reason: string; count: number }[];
    sampleEligible: { id: string; name: string; phoneMasked: string }[];
  };
  policy: {
    isQuietTimeNow: boolean;
    sendTime: string;
    batchSize: number;
    intervalMinutes: number;
    estimatedBatches: number;
    estimatedDurationMinutes: number;
  };
  blockingIssues: string[];
  warnings: string[];
  evaluatedAt: string;
};

/**
 * Executes a comprehensive, read-only preflight dry-run of a campaign without dispatching any real messages.
 * Audits template approval, sender ownership, tenant readiness, recipient consent, and policy limits.
 */
export async function validateCampaignPreflight(campaignId: string): Promise<CampaignPreflightResult> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      client: {
        select: {
          id: true,
          name: true,
          workspaceMode: true,
          quietFrom: true,
          quietTo: true,
          marketingGapHours: true,
          planRequired: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new Error(`Campaign "${campaignId}" not found.`);
  }

  const clientId = campaign.clientId;
  const client = campaign.client;
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  // 1. Template Safety Validation
  const template = campaign.template;
  let isTemplateApproved = false;
  let unmapped: string[] = [];

  if (!template) {
    blockingIssues.push("No template is assigned to this campaign.");
  } else {
    if (template.category === "AUTHENTICATION") {
      blockingIssues.push("Authentication templates cannot be used in marketing or broadcast campaigns.");
    }
    isTemplateApproved = template.status === "APPROVED";
    if (!isTemplateApproved) {
      blockingIssues.push(`Template "${template.name}" is not approved by Meta (current status: ${template.status}).`);
    }
    unmapped = unmappedVars({
      category: template.category,
      body: template.body,
      variables: template.variables as VarMap,
    }).map(String);
    if (unmapped.length > 0) {
      blockingIssues.push(
        `Template "${template.name}" has unmapped variables (${unmapped.map((v) => `{{${v}}}`).join(", ")}).`
      );
    }
  }

  // 2. Sender Number & Ownership Validation
  const { number: senderNumber } = await senderFor(clientId, campaign.senderId || null);
  let senderOwned = false;
  let senderActive = false;

  if (!senderNumber) {
    blockingIssues.push("No active WhatsApp sender number found for this workspace.");
  } else {
    senderOwned = senderNumber.clientId === clientId;
    if (!senderOwned) {
      blockingIssues.push("Assigned sender number belongs to another tenant account.");
    }
    if (template && template.businessAccountId && senderNumber.businessAccountId) {
      if (template.businessAccountId !== senderNumber.businessAccountId) {
        blockingIssues.push(
          `Template "${template.name}" belongs to WABA ${template.businessAccountId}, but sender uses WABA ${senderNumber.businessAccountId}.`
        );
      }
    }
    if (senderNumber.qualityRating === "RED") {
      warnings.push("Sender number has a RED quality rating on Meta. Campaign may experience reduced throughput.");
    }
    senderActive = true;
  }

  // 3. Workspace Readiness & Entitlement Validation
  const liveCheck = await canSendLiveOutbound(clientId, "campaign dry-run");
  const readiness = await resolveTenantReadiness(clientId);

  if (!liveCheck.allowed) {
    blockingIssues.push(liveCheck.reason || "Workspace is not authorized for live outbound messaging.");
  }

  const capacityBlock = await planCapacityBlock(clientId, "camp").catch(() => null);
  if (capacityBlock) {
    blockingIssues.push(capacityBlock);
  }

  // 4. Recipient Resolution, Consent & Opt-Out Filtering
  const isMarketing = template?.category === "MARKETING";

  const totalTenantCustomers = await db.customer.count({
    where: { clientId, deletedAt: null },
  });

  const allTenantRows = await db.customer.findMany({
    where: { clientId },
    select: {
      id: true,
      name: true,
      phone: true,
      optedOut: true,
      unreachable: true,
      deletedAt: true,
      optInAt: true,
      optInSource: true,
      tags: true,
      purchases: true,
      location: true,
      region: true,
      messages: {
        where: { run: { campaign: { template: { category: "MARKETING" } } } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  let consentVerified = 0;
  let consentUnverified = 0;
  let excludedOptOut = 0;
  let excludedUnreachable = 0;
  let excludedDeleted = 0;
  let excludedInvalidPhone = 0;
  let excludedDuplicate = 0;
  let excludedConsentUnverified = 0;
  let excludedRecentlyMarketed = 0;
  let excludedHandPicked = 0;
  let quietHourExclusions = 0;

  const excludeSet = new Set(campaign.excludeIds || []);
  const marketingGapHours = client.marketingGapHours ?? 72;
  const now = new Date();

  // Audience query criteria (without marketing consent constraint, to measure raw intended audience)
  const audienceWhereClause = await campaignAudienceWhere(clientId, campaign.audienceTag, campaign, { requirePositiveConsent: false });
  const audienceMatchedCustomers = await db.customer.findMany({
    where: audienceWhereClause,
    select: { id: true },
  });
  const audienceIdSet = new Set(audienceMatchedCustomers.map((c) => c.id));

  // Check quiet hours
  const isQuietNow = isQuietTime(client, campaign.sendTime || "10:00");

  const seenPhones = new Set<string>();
  const eligibleCustomers: { id: string; name: string; phoneMasked: string }[] = [];

  for (const c of allTenantRows) {
    if (c.deletedAt) {
      excludedDeleted++;
      continue;
    }
    if (c.optedOut) {
      excludedOptOut++;
      continue;
    }
    if (c.unreachable) {
      excludedUnreachable++;
      continue;
    }
    const { phones } = readPhones(c.phone);
    if (!phones || phones.length === 0) {
      excludedInvalidPhone++;
      continue;
    }
    if (excludeSet.has(c.id)) {
      excludedHandPicked++;
      continue;
    }

    // Only inspect audience matches for the campaign
    if (!audienceIdSet.has(c.id)) {
      continue;
    }

    // Duplicate recipient detection (by normalized phone)
    const norm = normalizePhone(c.phone || "") || c.phone;
    if (norm) {
      if (seenPhones.has(norm)) {
        excludedDuplicate++;
        continue;
      }
      seenPhones.add(norm);
    }

    // Consent accounting
    const hasPositiveConsent = Boolean(
      c.optInAt &&
      c.optInSource &&
      c.optInSource.trim().length > 0 &&
      !c.optedOut
    );

    if (hasPositiveConsent) {
      consentVerified++;
    } else {
      consentUnverified++;
    }

    // Strict marketing consent gate: marketing broadcasts require attributable opt-in
    if (isMarketing && !hasPositiveConsent) {
      excludedConsentUnverified++;
      continue;
    }

    // Marketing gap protection
    if (isMarketing && c.messages && c.messages.length > 0) {
      const lastMsgDate = c.messages[0].createdAt;
      const hoursSince = (now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince < marketingGapHours) {
        excludedRecentlyMarketed++;
        continue;
      }
    }

    if (isQuietNow && isMarketing) {
      quietHourExclusions++;
    }

    const masked = c.phone.length > 6 ? `${c.phone.slice(0, 4)}****${c.phone.slice(-3)}` : c.phone;
    eligibleCustomers.push({
      id: c.id,
      name: c.name || "Customer",
      phoneMasked: masked,
    });
  }

  if (eligibleCustomers.length === 0) {
    blockingIssues.push("No eligible recipients found matching audience filters and verified consent criteria.");
  }

  // 5. Policy & Timing
  if (isQuietNow && isMarketing) {
    warnings.push(
      `Scheduled send time (${campaign.sendTime || "10:00"}) falls within quiet hours (${client.quietFrom} to ${client.quietTo}). Outbound delivery will be held until quiet hours conclude.`
    );
  }

  if (isMarketing && consentUnverified > 0) {
    warnings.push(
      `Campaign audience includes ${consentUnverified} recipient(s) without attributable marketing opt-in records. These have been excluded from dispatch; human operator review required prior to launch.`
    );
  }

  const batchSize = Math.max(1, campaign.batchSize || 50);
  const intervalMinutes = Math.max(1, campaign.intervalMinutes || 15);
  const estimatedBatches = Math.ceil(eligibleCustomers.length / batchSize);
  const estimatedDurationMinutes = estimatedBatches > 1 ? (estimatedBatches - 1) * intervalMinutes : 0;

  // 6. Overall Status Synthesis
  let status: CampaignPreflightStatus = "READY_FOR_MANUAL_LAUNCH";
  if (blockingIssues.length > 0) {
    status = "NO_GO";
  } else if (warnings.length > 0 || !readiness.hasActiveSubscription || consentUnverified > 0) {
    status = "CONDITIONAL_GO";
  }

  return {
    ok: blockingIssues.length === 0,
    status,
    campaignId,
    campaignName: campaign.name,
    clientId,
    clientName: client.name,
    template: {
      id: template?.id || "",
      name: template?.name || "",
      category: template?.category || "",
      language: template?.language || "",
      status: template?.status || "UNKNOWN",
      isApproved: isTemplateApproved,
      unmappedVariables: unmapped,
    },
    sender: {
      id: senderNumber?.id || null,
      displayPhone: senderNumber?.displayPhone || null,
      qualityRating: senderNumber?.qualityRating || null,
      messagingTier: senderNumber?.messagingTier || null,
      isOwnedByTenant: senderOwned,
      hasActiveConnection: senderActive,
    },
    entitlement: {
      workspaceMode: client.workspaceMode,
      hasActiveSubscription: readiness.hasActiveSubscription,
      isSuspended: readiness.isSuspended,
      canSendLiveOutbound: liveCheck.allowed,
      reason: liveCheck.reason,
    },
    recipients: {
      totalTenantCustomers,
      matchingAudienceInput: audienceMatchedCustomers.length,
      consentVerified,
      consentUnverified,
      eligibleCount: eligibleCustomers.length,
      excludedOptOut,
      excludedUnreachable,
      excludedDeleted,
      excludedInvalidPhone,
      excludedDuplicate,
      excludedConsentUnverified,
      excludedRecentlyMarketed,
      excludedHandPicked,
      quietHourExclusions,
      breakdown: [
        { reason: "Consent unverified (missing attributable opt-in record)", count: excludedConsentUnverified },
        { reason: "Opted-out (explicit consent withdrawal)", count: excludedOptOut },
        { reason: "Unreachable (previous delivery failure / inactive)", count: excludedUnreachable },
        { reason: "Duplicate recipient (shared phone number)", count: excludedDuplicate },
        { reason: "Archived / Soft-deleted", count: excludedDeleted },
        { reason: "Invalid / Missing phone format", count: excludedInvalidPhone },
        { reason: `Marketing gap protection (< ${marketingGapHours}h since last offer)`, count: excludedRecentlyMarketed },
        { reason: "Hand-picked excluded from campaign", count: excludedHandPicked },
      ],
      sampleEligible: eligibleCustomers.slice(0, 5),
    },
    policy: {
      isQuietTimeNow: isQuietNow,
      sendTime: campaign.sendTime || "10:00",
      batchSize,
      intervalMinutes,
      estimatedBatches,
      estimatedDurationMinutes,
    },
    blockingIssues,
    warnings,
    evaluatedAt: new Date().toISOString(),
  };
}

export type PrimaryDisposition =
  | "ELIGIBLE_NOW"
  | "INTERNAL_COOLDOWN"
  | "PROVIDER_REASSESSMENT"
  | "CAMPAIGN_SUPPRESSED"
  | "PERMANENTLY_EXCLUDED"
  | "NEEDS_REVIEW";

export type AudienceDetailedPartition = {
  ok: boolean;
  total: number;
  eligibleNow: number;
  dispositions: {
    eligibleNow: number;
    internalCooldown: number;
    providerReassessment: number;
    campaignSuppressed: number;
    permanentlyExcluded: number;
    needsReview: number;
  };
  marketingGap: {
    count: number;
    earliestUnlockAt: string | null;
    latestUnlockAt: string | null;
    buckets: { label: string; count: number }[];
  };
  metaHoldback: {
    count: number;
    explanation: string;
  };
  excluded: {
    total: number;
    optedOut: number;
    unreachable: number;
    invalidPhone: number;
    dormant: number;
  };
  unread: number;
  testIds: string[];
};

/**
 * Evaluates the authoritative 6-way recipient disposition partition before send:
 * 1. ELIGIBLE_NOW (Passed all consent, reachability, marketing-gap, and suppression checks)
 * 2. INTERNAL_COOLDOWN (Deterministic 72h marketing gap with exact unlock timestamps)
 * 3. PROVIDER_REASSESSMENT (Meta Error 131049 ecosystem holdback)
 * 4. CAMPAIGN_SUPPRESSED (Unread filter / campaign suppressions)
 * 5. PERMANENTLY_EXCLUDED (Opted out, unreachable, E.164-invalid phone, dormant)
 * 6. NEEDS_REVIEW (Meta Error 130472 test or ambiguous holdback)
 *
 * Mathematical Invariant:
 * Total == ELIGIBLE_NOW + INTERNAL_COOLDOWN + PROVIDER_REASSESSMENT + CAMPAIGN_SUPPRESSED + PERMANENTLY_EXCLUDED + NEEDS_REVIEW
 */
export async function partitionAudienceDetailed(
  clientId: string,
  audienceTag?: string | null,
  people: { includeIds?: string[]; excludeIds?: string[]; segments?: string[]; templateId?: string; skipUnread?: boolean } = {},
): Promise<AudienceDetailedPartition> {
  const [client, template] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { marketingGapHours: true } }),
    people.templateId ? db.template.findUnique({ where: { id: people.templateId, clientId }, select: { category: true } }) : null,
  ]);
  const gapHours = client?.marketingGapHours ?? 72;
  const isMarketing = template ? template.category === "MARKETING" : true;

  const pick = decodeTags(audienceTag);
  let audienceBase: Prisma.CustomerWhereInput = { clientId, deletedAt: null };
  if (audienceTag && audienceTag.startsWith(AUDIENCE_PREFIX)) {
    const audId = audienceTag.slice(AUDIENCE_PREFIX.length);
    const aud = await db.audience.findFirst({ where: { id: audId, clientId } });
    if (aud) {
      audienceBase = await audienceWhere(clientId, aud.filter as AudienceFilter, new Date(), false);
      delete audienceBase.optedOut;
      delete audienceBase.unreachable;
    }
  } else if (pick && pick.tags.length > 0) {
    audienceBase = {
      clientId,
      deletedAt: null,
      tags: pick.tags.length === 1 ? { has: pick.tags[0] } : pick.match === "all" ? { hasEvery: pick.tags } : { hasSome: pick.tags },
    };
  }

  const rawWhere: Prisma.CustomerWhereInput = {
    AND: [
      people.includeIds?.length ? { OR: [audienceBase, { id: { in: people.includeIds }, clientId, deletedAt: null }] } : audienceBase,
      ...(people.excludeIds?.length ? [{ id: { notIn: people.excludeIds } }] : []),
    ],
  };

  const now = new Date();
  const gapCutoff = new Date(now.getTime() - gapHours * 3_600_000);
  const skipCutoff = new Date(now.getTime() - SKIP_DAYS * 86_400_000);

  // 1. Excluded cohorts
  const [optedOutCount, unreachableCount, dormantCount, allRawCustomers] = await Promise.all([
    db.customer.count({ where: { AND: [rawWhere, { optedOut: true }] } }),
    db.customer.count({ where: { AND: [rawWhere, { optedOut: false, unreachable: true }] } }),
    db.customer.count({ where: { AND: [rawWhere, { optedOut: false, unreachable: false, tags: { has: INACTIVE_TAG } }] } }),
    db.customer.findMany({
      where: { AND: [rawWhere, { optedOut: false, unreachable: false, NOT: { tags: { has: INACTIVE_TAG } } }] },
      select: { id: true, phone: true },
    }),
  ]);

  // E.164-aware international phone validation on candidates
  const invalidPhoneIds = new Set<string>();
  for (const c of allRawCustomers) {
    const normalized = normalizePhone(c.phone || "");
    if (!normalized) invalidPhoneIds.add(c.id);
  }
  const invalidPhoneCount = invalidPhoneIds.size;
  const validCandidateIds = allRawCustomers.filter((c) => !invalidPhoneIds.has(c.id)).map((c) => c.id);

  const excludedTotal = optedOutCount + unreachableCount + dormantCount + invalidPhoneCount;

  if (validCandidateIds.length === 0) {
    const total = excludedTotal;
    return {
      ok: true,
      total,
      eligibleNow: 0,
      dispositions: {
        eligibleNow: 0,
        internalCooldown: 0,
        providerReassessment: 0,
        campaignSuppressed: 0,
        permanentlyExcluded: excludedTotal,
        needsReview: 0,
      },
      marketingGap: { count: 0, earliestUnlockAt: null, latestUnlockAt: null, buckets: [] },
      metaHoldback: { count: 0, explanation: "No customers held back by Meta." },
      excluded: { total: excludedTotal, optedOut: optedOutCount, unreachable: unreachableCount, invalidPhone: invalidPhoneCount, dormant: dormantCount },
      unread: 0,
      testIds: [],
    };
  }

  // 2. Marketing gap, Meta holdback, and unread suppression on valid candidates
  let gapCount = 0;
  let meta131049Count = 0;
  let meta130472Count = 0;
  let unreadSuppressedCount = 0;
  let earliestUnlockAt: string | null = null;
  let latestUnlockAt: string | null = null;
  const buckets: { label: string; count: number }[] = [];

  const [tests, unreadSet] = await Promise.all([
    db.customer.findMany({ where: { AND: [rawWhere, { tags: { has: TEST_TAG } }] }, select: { id: true }, take: 50 }),
    notOpeningOffers(clientId),
  ]);

  if (isMarketing) {
    const recentGapMessages = await db.message.findMany({
      where: {
        customerId: { in: validCandidateIds },
        status: { in: ["SENT", "DELIVERED", "READ"] },
        sentAt: { gte: gapCutoff },
        template: { category: "MARKETING" },
      },
      select: { customerId: true, sentAt: true },
      orderBy: { sentAt: "asc" },
    });

    const gapCustomerMap = new Map<string, Date>();
    for (const m of recentGapMessages) {
      if (m.customerId && m.sentAt) {
        const prev = gapCustomerMap.get(m.customerId);
        if (!prev || m.sentAt > prev) {
          gapCustomerMap.set(m.customerId, m.sentAt);
        }
      }
    }
    gapCount = gapCustomerMap.size;

    if (gapCount > 0) {
      const unlockDates = Array.from(gapCustomerMap.values()).map(
        (sentAt) => new Date(sentAt.getTime() + gapHours * 3_600_000)
      );
      unlockDates.sort((a, b) => a.getTime() - b.getTime());
      earliestUnlockAt = unlockDates[0].toISOString();
      latestUnlockAt = unlockDates[unlockDates.length - 1].toISOString();

      let b12 = 0;
      let b24 = 0;
      let b48 = 0;
      let b72 = 0;
      for (const u of unlockDates) {
        const diffH = (u.getTime() - now.getTime()) / 3_600_000;
        if (diffH <= 12) b12++;
        else if (diffH <= 24) b24++;
        else if (diffH <= 48) b48++;
        else b72++;
      }
      if (b12 > 0) buckets.push({ label: "Within 12 hours", count: b12 });
      if (b24 > 0) buckets.push({ label: "12 to 24 hours", count: b24 });
      if (b48 > 0) buckets.push({ label: "24 to 48 hours", count: b48 });
      if (b72 > 0) buckets.push({ label: "48 to 72 hours", count: b72 });
    }

    // Meta holdback: candidates NOT in gapCustomerMap
    const nonGapCandidateIds = validCandidateIds.filter((id) => !gapCustomerMap.has(id));
    if (nonGapCandidateIds.length > 0) {
      const [held131049, held130472] = await Promise.all([
        db.message.findMany({
          where: {
            customerId: { in: nonGapCandidateIds },
            status: "FAILED",
            errorCode: 131049,
            failedAt: { gt: skipCutoff },
          },
          select: { customerId: true },
          distinct: ["customerId"],
        }),
        db.message.findMany({
          where: {
            customerId: { in: nonGapCandidateIds },
            status: "FAILED",
            errorCode: 130472,
            failedAt: { gt: skipCutoff },
          },
          select: { customerId: true },
          distinct: ["customerId"],
        }),
      ]);
      meta131049Count = held131049.length;
      meta130472Count = held130472.length;
    }
  }

  // Check unread suppression if skipUnread requested
  const heldIds = new Set<string>();
  const nonHeldCandidateIds = validCandidateIds.filter((id) => !heldIds.has(id));
  if (people.skipUnread && unreadSet.size > 0) {
    unreadSuppressedCount = nonHeldCandidateIds.filter((id) => unreadSet.has(id)).length;
  }

  const eligibleNow = validCandidateIds.length - gapCount - meta131049Count - meta130472Count - unreadSuppressedCount;
  const total = eligibleNow + gapCount + meta131049Count + meta130472Count + unreadSuppressedCount + excludedTotal;

  const unreadIn = unreadSet.size ? await db.customer.count({ where: { AND: [rawWhere, { id: { in: [...unreadSet] } }] } }) : 0;

  return {
    ok: true,
    total,
    eligibleNow,
    dispositions: {
      eligibleNow,
      internalCooldown: gapCount,
      providerReassessment: meta131049Count,
      campaignSuppressed: unreadSuppressedCount,
      permanentlyExcluded: excludedTotal,
      needsReview: meta130472Count,
    },
    marketingGap: {
      count: gapCount,
      earliestUnlockAt,
      latestUnlockAt,
      buckets,
    },
    metaHoldback: {
      count: meta131049Count + meta130472Count,
      explanation: "Held by Meta frequency protection across all businesses. Re-evaluated at dispatch time.",
    },
    excluded: {
      total: excludedTotal + unreadSuppressedCount,
      optedOut: optedOutCount,
      unreachable: unreachableCount,
      invalidPhone: invalidPhoneCount,
      dormant: dormantCount,
    },
    unread: unreadIn,
    testIds: tests.map((t) => t.id),
  };
}
