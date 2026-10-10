import { Inbox } from "lucide-react";
import Link from "next/link";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { fmtNumber } from "@/lib/format";

/**
 * What customers sent back in the last 7 days and what still needs an answer. Counts only:
 * one customer can write many times, so replies are never shown as a share of messages sent.
 */
export function RepliesCard({ replies, customers, open, className }: { replies: number; customers: number; open: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Customer replies" description="Last 7 days" />
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="px-4 py-4 sm:px-5">
          <p className="tabular text-2xl font-semibold leading-tight text-ink">{fmtNumber(replies)}</p>
          <p className="mt-1 text-xs text-muted">
            replies from {fmtNumber(customers)} customer{customers === 1 ? "" : "s"}
          </p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <p className="tabular text-2xl font-semibold leading-tight text-ink">{fmtNumber(open)}</p>
          <p className="mt-1 text-xs text-muted">waiting for an answer (all time)</p>
        </div>
      </div>
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <Link href="/dashboard/replies" className={buttonClass("secondary", "sm", false) + " w-full"}>
          <Inbox aria-hidden className="size-4" /> Open replies
        </Link>
      </div>
    </Card>
  );
}
