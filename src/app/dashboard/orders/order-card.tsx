import Link from "next/link";
import { Badge, Card, OrderStatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { OrderActions } from "./order-actions";

export type OrderCardData = {
  id: string;
  number: number;
  status: "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  total: number;
  currency: string;
  note: string | null;
  internalNote: string | null;
  createdAt: Date;
  paidAt: Date | null;
  paymentTxnId: string | null;
  paymentRequestedAt: Date | null;
  customer: { id: string; name: string; phone: string; location: string | null; client: { name: string } };
  client: { paymentConfig: string | null };
};

/** One order: who, what, the total, where it stands, and the buttons that move it along. */
export function OrderCard({ order: o, items, showClient, canEdit }: { order: OrderCardData; items: OrderItem[]; showClient: boolean; canEdit: boolean }) {
  return (
    <Card className="flex h-full flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/dashboard/customers/${o.customer.id}`} className="font-semibold text-ink hover:underline">
            {o.customer.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            <span className="tabular">{formatPhone(o.customer.phone)}</span>
            {o.customer.location && <> · {o.customer.location}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OrderStatusBadge status={o.status} />
          {showClient && <Badge>{o.customer.client.name}</Badge>}
        </div>
      </div>

      <div className="rounded-control bg-sunken px-3 text-sm">
        <ul className="divide-y divide-line">
          {items.map((i, k) => (
            <li key={k} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="tabular font-semibold">{i.quantity} ×</span> {i.name ?? i.id}
              </span>
              <span className="tabular shrink-0 text-muted">{money(i.price * i.quantity, i.currency)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between gap-3 border-t border-line py-2 font-semibold">
          <span>Total</span>
          <span className="tabular">{money(o.total, o.currency)}</span>
        </p>
      </div>

      <div className="space-y-1 text-xs text-muted">
        <p className="tabular">
          {orderRef(o)} · {fmtDate(o.createdAt, "EEE d MMM, h:mm a")}
        </p>
        {o.note && (
          <p className="text-sm text-ink">
            <span className="text-muted">Customer note: </span>
            {o.note}
          </p>
        )}
        {(o.paidAt || o.paymentRequestedAt) && (
          <p>
            {o.paidAt ? (
              <>
                Paid on WhatsApp {fmtDate(o.paidAt, "d MMM, h:mm a")}
                {o.paymentTxnId && <> · UPI ref {o.paymentTxnId}</>}
              </>
            ) : (
              <>Payment requested {fmtDate(o.paymentRequestedAt, "d MMM, h:mm a")} · waiting for the customer</>
            )}
          </p>
        )}
      </div>

      <OrderActions
        id={o.id}
        who={o.customer.name}
        status={o.status}
        note={o.internalNote}
        canEdit={canEdit}
        payment={o.client.paymentConfig && o.total > 0 && !o.paidAt ? (o.paymentRequestedAt ? "again" : "first") : null}
      />
    </Card>
  );
}
