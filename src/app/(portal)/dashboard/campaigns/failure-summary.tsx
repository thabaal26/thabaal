import { RotateCcw } from "@/components/icons";
import { Alert3D } from "@/components/icons-3d";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { heldSummary, HELD_CODES, RETRY_UNTIL_DAYS, type HeldSummary } from "@/lib/held";
import { inactiveCandidates, type InactiveGroup } from "@/lib/inactive";
import { metaError, type ErrorKind } from "@/lib/meta-errors";
import { moveFailedToInactive, retryHeldBackNow } from "../actions/campaigns";

type Kind = Exclude<ErrorKind, "marketing-limit">;

/**
 * For each kind of failure: the reason in a few words, whether sending again can work, and what to do. Meta's
 * advice per code: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const NEXT: Record<Kind, { label: string; why: string; again: string; tip?: string; inactive?: InactiveGroup; tone: Tone }> = {
  unreachable: {
    label: "Can't receive WhatsApp",
    why: "No WhatsApp on this number, an old app, or they blocked you.",
    again: "Sending again is a waste: it fails until they fix it. Campaigns already leave them out.",
    tip: "Call them and ask them to update WhatsApp. Move them to Dormant to keep your list clean.",
    inactive: "unreachable",
    tone: "gray",
  },
  experiment: {
    label: "In a Meta test",
    why: "Meta stops offers to a few people as a test, with no end date.",
    again: "Sending again is a waste: Meta says it gets the same error.",
    tip: "They still get your offers if they message you first. Move them to Dormant.",
    inactive: "experiment",
    tone: "gray",
  },
  "stopped-marketing": { label: "Turned off your offers", why: "They stopped offers from you in WhatsApp.", again: "Never sent again: they're opted out.", tone: "gray" },
  rate: { label: "Sent too fast", why: "Meta asked to slow down.", again: "Lower the batch size if this keeps happening.", tone: "amber" },
  "pair-rate": { label: "Too many messages to one person", why: "This customer got several messages from you in a short time.", again: "Not charged. Send to them again later; everyone else in the campaign was still sent.", tone: "amber" },
  temporary: { label: "Meta briefly unavailable", why: "WhatsApp had a short problem.", again: "Campaigns keep these queued and try again a few minutes later.", tone: "gray" },
  setup: { label: "Access token or app permissions", why: "Meta didn't accept the connection.", again: "Campaigns pause until an admin replaces the token on the Clients page or fixes the app in Meta.", tone: "red" },
  "number-restricted": { label: "Number limited by Meta", why: "Meta limited your number.", again: "Sending paused to protect the number. Check WhatsApp number health on the Dashboard.", tone: "red" },
  window: { label: "Outside the 24-hour window", why: "Only templates can go out after 24 hours.", again: "Nothing to do for campaigns.", tone: "gray" },
  template: { label: "Template problem", why: "Meta didn't accept the template.", again: "Fix or replace the template, then send again.", tone: "red" },
  "test-list": { label: "Not a test recipient", why: "A Meta test number only reaches its listed recipients.", again: "Add the number in Meta → API setup.", tone: "amber" },
  account: { label: "Meta account problem", why: "Payment, registration or an account setting in Meta.", again: "Campaigns pause until an admin fixes it.", tone: "red" },
  other: { label: "Other errors", why: "Meta gave another reason.", again: "See the message log for Meta's exact words.", tone: "gray" },
};

/**
 * Why this campaign's messages failed, grouped, each with a simple reason, whether sending again can work, and a
 * suggestion the business can take (send once more, move to Dormant). Nothing here happens by itself.
 */
export async function FailureSummary({ campaignId, runIds, canManage }: { campaignId: string; runIds: string[]; canManage: boolean }) {
  if (!runIds.length) return null;
  const [byCode, held, movable] = await Promise.all([
    db.message.groupBy({ by: ["errorCode"], where: { runId: { in: runIds }, status: "FAILED", OR: [{ errorCode: null }, { errorCode: { notIn: HELD_CODES } }] }, _count: true }),
    heldSummary(runIds),
    inactiveCandidates(runIds),
  ]);

  const groups = new Map<string, number>();
  for (const g of byCode) {
    const kind = (metaError(g.errorCode)?.kind ?? "other") as Kind;
    groups.set(kind, (groups.get(kind) ?? 0) + g._count);
  }
  const toMove = { unreachable: movable.unreachable.length, experiment: movable.experiment.length, heldTwice: movable.heldTwice.length };
  return <FailureSummaryView campaignId={campaignId} groups={[...groups]} held={held} toMove={toMove} canManage={canManage} />;
}

function MoveButton({ campaignId, group, n }: { campaignId: string; group: InactiveGroup; n: number }) {
  return (
    <ActionButton
      className="shrink-0 max-sm:w-full"
      variant="secondary"
      action={moveFailedToInactive.bind(null, campaignId, group)}
      confirm={`Move ${n} customer${n === 1 ? "" : "s"} to Dormant? Campaigns leave them out until you remove the "inactive" tag.`}
    >
      Move {fmtNumber(n)} to Dormant
    </ActionButton>
  );
}

/** The card itself, from already-counted failures (kept separate so it can be previewed with sample data). */
export function FailureSummaryView({
  campaignId,
  groups,
  held,
  toMove,
  canManage,
}: {
  campaignId: string;
  groups: [string, number][];
  held: HeldSummary;
  toMove: Record<InactiveGroup, number>;
  canManage: boolean;
}) {
  const heldTotal = held.ready + held.waiting + held.retriedOk + held.heldTwice + held.expired + held.inactive;
  if (!heldTotal && !groups.length) return null;

  return (
    <Card className="card-3d mt-4 sm:mt-6">
      <CardHeader
        tone="rose"
        icon={<Alert3D />}
        title="Why messages failed"
        description="Each reason with what to do next. Failed messages aren't charged by Meta."
        action={
          <Link href={`/dashboard/messages?campaign=${campaignId}&status=FAILED`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-deep hover:underline sm:min-h-8">
            See failed messages
          </Link>
        }
      />
      <ul className="m-0 list-none divide-y divide-line p-0">
        {heldTotal > 0 && (
          <li className="px-4 py-3.5 sm:px-5" data-testid="failure-held">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  Too many offers <Badge tone="amber">{fmtNumber(heldTotal)}</Badge>
                </p>
                <p className="mt-1 max-w-read text-sm text-muted">Meta holds offers back from people who get a lot of them.</p>
                <p className="mt-1 max-w-read text-sm text-ink-2">
                  {held.ready > 0
                    ? `${fmtNumber(held.ready)} can be sent again now (24 hours have passed). If Meta holds it again, move them to Dormant.`
                    : held.readyAt
                      ? `Can be sent again after 24 hours, from ${fmtDate(held.readyAt, "d MMM, h:mm a")}. Sooner is held again.`
                      : "Each one can be sent again once, after 24 hours."}
                </p>
                <ul className="tabular m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-ink-2">
                  {held.waiting > 0 && held.ready > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.waiting)}</b> more from {fmtDate(held.readyAt!, "d MMM, h:mm a")}
                    </li>
                  )}
                  {held.retriedOk > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.retriedOk)}</b> went through when sent again
                    </li>
                  )}
                  {held.heldTwice > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.heldTwice)}</b> held back again
                    </li>
                  )}
                  {held.inactive > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.inactive)}</b> in Dormant
                    </li>
                  )}
                  {held.expired > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.expired)}</b> too old to send again (over {RETRY_UNTIL_DAYS} days)
                    </li>
                  )}
                </ul>
              </div>
              {canManage && (held.ready > 0 || toMove.heldTwice > 0) && (
                <div className="flex shrink-0 flex-col gap-2 max-sm:w-full">
                  {held.ready > 0 && (
                    <ActionButton
                      className="shrink-0 max-sm:w-full"
                      action={retryHeldBackNow.bind(null, campaignId)}
                      confirm={`Send the offer once more to ${held.ready} customer${held.ready === 1 ? "" : "s"} Meta held back? Each gets only this one more try.`}
                    >
                      <RotateCcw aria-hidden className="size-4 shrink-0" /> Send again to {fmtNumber(held.ready)}
                    </ActionButton>
                  )}
                  {toMove.heldTwice > 0 && <MoveButton campaignId={campaignId} group="heldTwice" n={toMove.heldTwice} />}
                </div>
              )}
            </div>
          </li>
        )}
        {groups.map(([kind, n]) => {
          const g = NEXT[kind as Kind];
          const move = g.inactive ? toMove[g.inactive] : 0;
          return (
            <li key={kind} className="px-4 py-3.5 sm:px-5" data-testid={`failure-${kind}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {g.label} <Badge tone={g.tone}>{fmtNumber(n)}</Badge>
                  </p>
                  <p className="mt-1 max-w-read text-sm text-muted">{g.why}</p>
                  <p className="mt-1 max-w-read text-sm text-ink-2">{g.again}</p>
                  {g.tip && <p className="mt-1 max-w-read text-xs text-muted">{g.inactive && !move ? "All of them are in Dormant." : g.tip}</p>}
                </div>
                {canManage && g.inactive && move > 0 && <MoveButton campaignId={campaignId} group={g.inactive} n={move} />}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export type ClassifiedSkip = {
  key: string;
  label: string;
  ownerLabel: string;
  tone: Tone;
  why: string;
  guidance: string;
  count: number;
  deepLink?: { href: string; label: string };
  examples: string[];
};

export function classifySkipReason(error: string | null): { key: string; label: string; ownerLabel: string; tone: Tone; why: string; guidance: string; deepLink?: { href: string; label: string } } {
  const err = error || "";
  if (/Already got an offer within \d+ hours/i.test(err)) {
    return {
      key: "MARKETING_GAP_ACTIVE",
      label: "Business Marketing Gap Protection",
      ownerLabel: "Thabaal Policy",
      tone: "amber",
      why: "Recipient received another marketing offer within your business cooldown window.",
      guidance: "Prevents spamming customers. Automatically resets when the gap window passes.",
      deepLink: { href: "/dashboard/settings#sending-rules", label: "Adjust in Settings › Sending Rules" },
    };
  }
  if (/Meta is holding back marketing/i.test(err)) {
    return {
      key: "META_SUPPRESSION_UNSPECIFIED",
      label: "Meta Marketing Frequency Restriction",
      ownerLabel: "Meta Cloud API",
      tone: "red",
      why: "Meta algorithmically holds back marketing offers from recipients who receive high volumes across WhatsApp.",
      guidance: "Meta controls this restriction. There is no guaranteed release time. Recheck recipient eligibility before a later attempt.",
    };
  }
  if (/Didn't open the last \d+ offers/i.test(err)) {
    return {
      key: "UNREAD_OFFERS",
      label: "Unread Offers Filter",
      ownerLabel: "Campaign Rule",
      tone: "gray",
      why: "Skipped because the recipient hasn't opened previous marketing offers.",
      guidance: "Can be turned off in campaign settings (Leave out unread offers).",
    };
  }
  if (/Number can't receive WhatsApp|Customer opted out|archived or deleted/i.test(err)) {
    return {
      key: "DORMANT_OR_UNREACHABLE",
      label: "Archived or Inactive Contacts",
      ownerLabel: "Contact Health",
      tone: "gray",
      why: "The contact is marked as unreachable, opted out, or archived.",
      guidance: "Check contact status in Customers to update or clean list.",
    };
  }
  if (/Consent unverified/i.test(err)) {
    return {
      key: "CONSENT_UNVERIFIED",
      label: "Marketing Consent Unverified",
      ownerLabel: "Compliance Guard",
      tone: "amber",
      why: "Recipient lacks verified marketing opt-in evidence (optInAt / optInSource).",
      guidance: "Ensure customer records have verifiable opt-in source before marketing.",
    };
  }
  return {
    key: "OTHER",
    label: "Other Protection Rule",
    ownerLabel: "Thabaal Guard",
    tone: "gray",
    why: err || "Skipped by safety policy.",
    guidance: "Check campaign log for exact details.",
  };
}

export async function SkippedSummary({
  campaignId,
  clientId,
  runIds,
  canManage,
}: {
  campaignId: string;
  clientId: string;
  runIds: string[];
  canManage: boolean;
}) {
  if (!runIds.length) return null;
  const skippedRows = await db.message.groupBy({
    by: ["error"],
    where: {
      runId: { in: runIds },
      status: "SKIPPED",
      run: {
        is: {
          campaignId,
          campaign: {
            is: { clientId },
          },
        },
      },
    },
    _count: true,
  });
  if (!skippedRows.length) return null;
  return <SkippedSummaryView campaignId={campaignId} rows={skippedRows} canManage={canManage} />;
}

export function SkippedSummaryView({
  campaignId,
  rows,
  canManage,
}: {
  campaignId: string;
  rows: { error: string | null; _count: number }[];
  canManage: boolean;
}) {
  const map = new Map<string, ClassifiedSkip>();
  for (const r of rows) {
    const meta = classifySkipReason(r.error);
    const existing = map.get(meta.key);
    if (existing) {
      existing.count += r._count;
      if (r.error && !existing.examples.includes(r.error) && existing.examples.length < 3) {
        existing.examples.push(r.error);
      }
    } else {
      map.set(meta.key, {
        ...meta,
        count: r._count,
        examples: r.error ? [r.error] : [],
      });
    }
  }
  const categories = [...map.values()].sort((a, b) => b.count - a.count);
  const totalSkipped = categories.reduce((sum, c) => sum + c.count, 0);

  if (totalSkipped === 0) return null;

  return (
    <Card className="card-3d mt-4 sm:mt-6" data-testid="skipped-summary">
      <CardHeader
        tone="amber"
        icon={<Alert3D />}
        title="Why messages were skipped"
        description="Recipients protected by marketing gap rules or held by Meta. Skipped messages are never charged."
        action={
          <Link href={`/dashboard/messages?campaign=${campaignId}&status=SKIPPED`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-deep hover:underline sm:min-h-8">
            See skipped messages
          </Link>
        }
      />
      <ul className="m-0 list-none divide-y divide-line p-0">
        {categories.map((cat) => (
          <li key={cat.key} className="px-4 py-3.5 sm:px-5" data-testid={`skipped-${cat.key}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{cat.label}</span>
                  <Badge tone={cat.tone}>{fmtNumber(cat.count)}</Badge>
                  <Badge tone="gray">{cat.ownerLabel}</Badge>
                </div>
                <p className="mt-1 max-w-read text-sm text-muted">{cat.why}</p>
                <p className="mt-1 max-w-read text-xs text-ink-2">{cat.guidance}</p>
                {cat.deepLink && (
                  <div className="mt-2">
                    <Link href={cat.deepLink.href} className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline">
                      {cat.deepLink.label} &rarr;
                    </Link>
                  </div>
                )}
              </div>
              {canManage && (
                <div className="shrink-0 max-sm:w-full">
                  <button
                    type="button"
                    disabled
                    className="btn sm secondary opacity-60 cursor-not-allowed max-sm:w-full"
                    title="Smart cohort scheduling will be enabled in the upcoming update"
                  >
                    Create Cohort Campaign
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
