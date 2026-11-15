import "server-only";
import { db } from "./db";
import { campaignAudienceWhere } from "./audiences";
import { senderFor } from "./senders";
import { unmappedVars, type VarMap } from "./template";
import { isQuietTime, recentlyMarketed } from "./rules";
import { planCapacityBlock } from "./subscription";
import { canSendLiveOutbound } from "./workspace-guard";
import { resolveTenantReadiness } from "./tenant-activation";
import { readPhones, normalizePhone } from "./phone";
import { cleanSegments } from "./engagement-segments";

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
