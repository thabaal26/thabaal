"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { notifyOrder, requestPayment, saveOrderNote, setOrderStatus, type DispatchDetails } from "../actions/orders";

type Status = "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

/** The next steps for an order: tell the customer, move it along, and keep a private note. */
/** payment: whether a "Review and pay" request can go out, and if one already did. */
export function OrderActions({ id, status, note, canEdit, payment = null }: { id: string; status: Status; note: string | null; canEdit: boolean; payment?: "first" | "again" | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(note ?? "");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [d, setD] = useState<DispatchDetails>({ eta: "today evening", by: "", phone: "", link: "" });
  if (!canEdit) return null;
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      toastResult(await fn());
      router.refresh();
    });
  const done = status === "DELIVERED" || status === "CANCELLED";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "NEW" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => notifyOrder(id, "confirm"))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm & message customer"}
          </Button>
        )}
        {(status === "CONFIRMED" || status === "PAID") && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setDispatchOpen(true)}
          >
            Dispatch & message customer
          </Button>
        )}
        {payment && (status === "NEW" || status === "CONFIRMED") && (
          <Button size="sm" variant={status === "CONFIRMED" && payment === "first" ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => requestPayment(id))}>
            {payment === "again" ? "Send payment request again" : "Request payment (UPI)"}
          </Button>
        )}
        {status === "CONFIRMED" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setOrderStatus(id, "PAID"))}>
            Mark paid
          </Button>
        )}
        {status === "DISPATCHED" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => notifyOrder(id, "deliver"))}>
              Delivered & thank customer
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setOrderStatus(id, "DELIVERED"))}>
              Mark delivered only
            </Button>
          </>
        )}
        {!done && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Cancel this order?")) run(() => setOrderStatus(id, "CANCELLED"));
            }}
          >
            Cancel
          </Button>
        )}
        {status === "CANCELLED" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setOrderStatus(id, "NEW"))}>
            Reopen
          </Button>
        )}
      </div>
      <Sheet open={dispatchOpen} onClose={() => setDispatchOpen(false)} title="Dispatch order">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setDispatchOpen(false);
            run(() => notifyOrder(id, "dispatch", d));
          }}
        >
          <div>
            <Label htmlFor={`eta-${id}`}>Reaches them by</Label>
            <input id={`eta-${id}`} className="field" required value={d.eta} placeholder="today evening, tomorrow 11 AM…" onChange={(e) => setD({ ...d, eta: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`by-${id}`} hint="optional">Delivery person / courier</Label>
              <input id={`by-${id}`} className="field" value={d.by} placeholder="Ravi, or DTDC" onChange={(e) => setD({ ...d, by: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`ph-${id}`} hint="optional">Their phone</Label>
              <input id={`ph-${id}`} className="field" inputMode="tel" value={d.phone} placeholder="98765 43210" onChange={(e) => setD({ ...d, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor={`tr-${id}`} hint="optional">Tracking link or number</Label>
            <input id={`tr-${id}`} className="field" value={d.link} placeholder="Courier tracking link or AWB number" onChange={(e) => setD({ ...d, link: e.target.value })} />
          </div>
          <p className="text-xs text-muted">The customer gets these details on WhatsApp, and they&apos;re saved in this order&apos;s note.</p>
          <Button type="submit" className="w-full" disabled={pending}>Dispatch & send message</Button>
        </form>
      </Sheet>
      <div className="flex gap-2">
        <input className="field flex-1" placeholder="Note: payment mode, address, delivery slot…" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" variant="secondary" disabled={pending || text.trim() === (note ?? "")} onClick={() => run(() => saveOrderNote(id, text))}>
          Save
        </Button>
      </div>
    </div>
  );
}
