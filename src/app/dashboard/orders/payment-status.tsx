import { AlertTriangle, Banknote, CheckCircle2, Clock, Hourglass, ReceiptText, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { money } from "@/lib/orders";
import { dueOf, methodLabel, methodOf, paymentState, receivedOf, SOURCE_LABEL, STATE_LABEL, STATE_TONE, type PayFields } from "@/lib/payment-state";

export type PaymentView = PayFields & {
  currency: string;
  paymentTxnId: string | null;
  paymentSource?: string | null;
  paymentClaimNote?: string | null;
  paymentFailReason?: string | null;
  paymentReminderAt?: Date | null;
  collectedBy?: string | null;
  refundNote?: string | null;
};

const when = (d: Date) => fmtDate(d, "d MMM, h:mm a");

/** Where the order's money stands, in one line plus what to do about it. */
export function PaymentSummary({ o, className }: { o: PaymentView; className?: string }) {
  const state = paymentState(o);
  const method = methodOf(o);
  const due = dueOf(o);
  const got = receivedOf(o);
  const tone = STATE_TONE[state];
  const Icon =
    state === "paid" ? CheckCircle2 : state === "cod_due" ? Banknote : state === "failed" || state === "refund_due" ? AlertTriangle : state === "claimed" ? Hourglass : state === "refunded" ? Undo2 : state === "requested" ? Clock : ReceiptText;

  let detail: string | null = null;
  if (state === "paid") {
    detail = [method && methodLabel(method, true), o.paymentSource && SOURCE_LABEL[o.paymentSource], o.paymentTxnId && `Ref ${o.paymentTxnId}`, o.collectedBy && `by ${o.collectedBy}`, o.paidAt && when(o.paidAt)]
      .filter(Boolean)
      .join(" · ");
  } else if (state === "part_paid") detail = `${money(got, o.currency)} received · ${money(due, o.currency)} still due`;
  else if (state === "cod_due") detail = `Collect ${money(due, o.currency)} in cash when delivered`;
  else if (state === "claimed") detail = `${o.paymentClaimNote ?? "Customer says they paid"}${o.paymentClaimedAt ? ` · ${when(o.paymentClaimedAt)}` : ""}. Check your UPI app or bank, then verify.`;
  else if (state === "failed") detail = `${o.paymentFailReason ?? "The UPI payment didn't go through"}${o.paymentFailedAt ? ` · ${when(o.paymentFailedAt)}` : ""}. Send the link again or call them.`;
  else if (state === "requested")
    detail = `${money(due, o.currency)} · link sent ${o.paymentRequestedAt ? when(o.paymentRequestedAt) : ""}${o.paymentReminderAt ? ` · reminded ${when(o.paymentReminderAt)}` : ""}`;
  else if (state === "unpaid") detail = due > 0 ? `${money(due, o.currency)} due · no payment asked yet` : null;
  else if (state === "refund_due") detail = `${money(got - (o.refundAmount ?? 0), o.currency)} was paid. Send it back, then record the refund.`;
  else if (state === "refunded") detail = `${money(o.refundAmount ?? 0, o.currency)} refunded${o.refundedAt ? ` · ${when(o.refundedAt)}` : ""}`;

  const partRefund = state !== "refunded" && (o.refundAmount ?? 0) > 0;
  const extra = o.status === "CANCELLED" ? 0 : got - (o.refundAmount ?? 0) - o.total;
  if (state === "paid" && extra >= 1) detail = `${detail ? `${detail} · ` : ""}${money(extra, o.currency)} more than the total was paid: refund the extra`;

  return (
    <div className={cn("flex items-start gap-2 text-xs", className)}>
      <Badge tone={tone} className="shrink-0">
        <Icon aria-hidden className="size-3" />
        {state === "cod_due" ? "COD" : STATE_LABEL[state]}
      </Badge>
      {(detail || partRefund) && (
        <p className={cn("min-w-0 pt-0.5 leading-snug", state === "failed" || state === "refund_due" ? "text-danger" : state === "claimed" ? "text-warning" : "text-muted")}>
          {detail}
          {partRefund && <span className="block text-muted">{money(o.refundAmount ?? 0, o.currency)} refunded{o.refundedAt ? ` · ${when(o.refundedAt)}` : ""}</span>}
        </p>
      )}
    </div>
  );
}
