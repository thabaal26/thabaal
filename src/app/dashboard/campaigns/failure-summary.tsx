import { RotateCcw } from "@/components/icons";
import { Alert3D } from "@/components/icons-3d";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { heldSummary, HELD_CODES, RETRY_AFTER_DAYS, RETRY_UNTIL_DAYS, type HeldSummary } from "@/lib/held";
import { metaError, type ErrorKind } from "@/lib/meta-errors";
import { retryHeldBackNow } from "../actions/campaigns";

/** For each kind of failure: what it means for the customer, and what the portal does next. */
const NEXT: Record<Exclude<ErrorKind, "marketing-limit">, { label: string; next: string; tone: Tone }> = {
  unreachable: { label: "Can't receive WhatsApp", next: "Not on WhatsApp, an old app or they blocked you. Left out of future campaigns automatically.", tone: "gray" },
  "stopped-marketing": { label: "Turned off your offers", next: "They stopped marketing from your business in WhatsApp. Opted out automatically.", tone: "gray" },
  rate: { label: "Sent too fast", next: "Meta asked to slow down. Lower the batch size if this keeps happening.", tone: "amber" },
  temporary: { label: "Meta briefly unavailable", next: "Campaigns keep these queued and try again a few minutes later.", tone: "gray" },
  setup: { label: "Access token or app permissions", next: "Campaigns pause until it's fixed. An admin needs to replace the token on the Clients page or fix the app in Meta.", tone: "red" },
  "number-restricted": { label: "Number limited by Meta", next: "Sending paused to protect the number. Check WhatsApp number health on the Dashboard.", tone: "red" },
  window: { label: "Outside the 24-hour window", next: "Only templates can go out after 24 hours. Nothing to do for campaigns.", tone: "gray" },
  template: { label: "Template problem", next: "Fix or replace the template, then send again.", tone: "red" },
  "test-list": { label: "Not a test recipient", next: "A Meta test number can only message its listed recipients. Add the number in Meta → API setup.", tone: "amber" },
  account: { label: "Meta account problem", next: "Payment, registration or account setting in Meta. Campaigns pause until an admin fixes it.", tone: "red" },
  other: { label: "Other errors", next: "See the message log for Meta's exact words.", tone: "gray" },
};

/**
 * Why this campaign's messages failed, grouped, with what happens next. Held-back marketing
 * (Meta error 131049/130472) gets its own line: it's retried once, automatically.
 */
export async function FailureSummary({ campaignId, runIds, canManage }: { campaignId: string; runIds: string[]; canManage: boolean }) {
  if (!runIds.length) return null;
  const [byCode, held] = await Promise.all([
    db.message.groupBy({ by: ["errorCode"], where: { runId: { in: runIds }, status: "FAILED", OR: [{ errorCode: null }, { errorCode: { notIn: HELD_CODES } }] }, _count: true }),
    heldSummary(runIds),
  ]);

  const groups = new Map<string, number>();
  for (const g of byCode) {
    const kind = (metaError(g.errorCode)?.kind ?? "other") as keyof typeof NEXT;
    groups.set(kind, (groups.get(kind) ?? 0) + g._count);
  }
  return <FailureSummaryView campaignId={campaignId} groups={[...groups]} held={held} canManage={canManage} />;
}

/** The card itself, from already-counted failures (kept separate so it can be previewed with sample data). */
export function FailureSummaryView({
  campaignId,
  groups,
  held,
  canManage,
}: {
  campaignId: string;
  groups: [string, number][];
  held: HeldSummary;
  canManage: boolean;
}) {
  const heldTotal = held.waiting + held.retriedOk + held.heldTwice + held.expired;
  if (!heldTotal && !groups.length) return null;

  return (
    <Card className="card-3d mt-4 sm:mt-6">
      <CardHeader
        tone="rose"
        icon={<Alert3D />}
        title="Why messages failed"
        description="Across the runs above. Failed messages aren't charged by Meta."
        action={
          <Link href={`/dashboard/messages?campaign=${campaignId}&status=FAILED`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-deep hover:underline sm:min-h-8">
            See failed messages
          </Link>
        }
      />
      <ul className="divide-y divide-line">
        {heldTotal > 0 && (
          <li className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  Held back by Meta <Badge tone="amber">{fmtNumber(heldTotal)}</Badge>
                </p>
                <p className="mt-1 max-w-read text-sm text-muted">
                  These customers get a lot of marketing from businesses, so Meta paused offers to them for now. Each one is sent once more, {RETRY_AFTER_DAYS} days later; campaigns skip them meanwhile.
                </p>
                <ul className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                  {held.waiting > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.waiting)}</b> waiting{held.nextRetry && <>, first retry {held.nextRetry <= new Date() ? "on the next scheduler run" : `about ${fmtDate(held.nextRetry, "d MMM, h:mm a")}`}</>}
                    </li>
                  )}
                  {held.retriedOk > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.retriedOk)}</b> went through on the retry
                    </li>
                  )}
                  {held.heldTwice > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.heldTwice)}</b> held back again (not retried further)
                    </li>
                  )}
                  {held.expired > 0 && (
                    <li>
                      <b className="text-ink">{fmtNumber(held.expired)}</b> not retried (older than {RETRY_UNTIL_DAYS} days)
                    </li>
                  )}
                </ul>
              </div>
              {canManage && held.waiting > 0 && (
                <ActionButton
                  className="shrink-0 max-sm:w-full"
                  action={retryHeldBackNow.bind(null, campaignId)}
                  confirm={`Send the ${held.waiting} held-back message${held.waiting === 1 ? "" : "s"} again now? Meta suggests waiting a few days; retrying early often gets held back again, and each customer only gets one retry.`}
                >
                  <RotateCcw aria-hidden className="size-4" /> Retry now
                </ActionButton>
              )}
            </div>
          </li>
        )}
        {groups.map(([kind, n]) => {
          const g = NEXT[kind as keyof typeof NEXT];
          return (
            <li key={kind} className="px-4 py-3.5 sm:px-5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                {g.label} <Badge tone={g.tone}>{fmtNumber(n)}</Badge>
              </p>
              <p className="mt-1 max-w-read text-sm text-muted">{g.next}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
