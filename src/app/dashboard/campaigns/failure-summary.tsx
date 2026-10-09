import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, type Tone } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { heldSummary, HELD_CODES, RETRY_AFTER_DAYS, RETRY_UNTIL_DAYS } from "@/lib/held";
import { metaError, type ErrorKind } from "@/lib/meta-errors";
import { retryHeldBackNow } from "../actions/campaigns";

/** For each kind of failure: what it means for the customer, and what the portal does next. */
const NEXT: Record<Exclude<ErrorKind, "marketing-limit">, { label: string; next: string; tone: Tone }> = {
  unreachable: { label: "Can't receive WhatsApp", next: "Not on WhatsApp, an old app or they blocked you. Left out of future campaigns automatically.", tone: "gray" },
  "stopped-marketing": { label: "Turned off your offers", next: "They stopped marketing from your business in WhatsApp. Opted out automatically.", tone: "gray" },
  rate: { label: "Sent too fast", next: "Meta asked to slow down. Lower the batch size if this keeps happening.", tone: "amber" },
  "number-restricted": { label: "Number limited by Meta", next: "Sending paused to protect the number. Check WhatsApp number health on the Overview.", tone: "red" },
  window: { label: "Outside the 24-hour window", next: "Only templates can go out after 24 hours. Nothing to do for campaigns.", tone: "gray" },
  template: { label: "Template problem", next: "Fix or replace the template, then send again.", tone: "red" },
  "test-list": { label: "Not a test recipient", next: "A Meta test number can only message its listed recipients. Add the number in Meta → API setup.", tone: "amber" },
  account: { label: "Meta account problem", next: "Payment or registration issue in Meta Business settings. Ask your admin.", tone: "red" },
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
  const heldTotal = held.waiting + held.retriedOk + held.heldTwice + held.expired;
  if (!heldTotal && !groups.size) return null;

  return (
    <Card className="mt-4 sm:mt-6">
      <CardHeader
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
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
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
                  action={retryHeldBackNow.bind(null, campaignId)}
                  confirm={`Send the ${held.waiting} held-back message${held.waiting === 1 ? "" : "s"} again now? Meta suggests waiting a few days; retrying early often gets held back again, and each customer only gets one retry.`}
                >
                  <RotateCcw aria-hidden className="size-4" /> Retry now
                </ActionButton>
              )}
            </div>
          </li>
        )}
        {[...groups].map(([kind, n]) => {
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
