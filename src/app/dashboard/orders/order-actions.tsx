"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui";
import { notifyOrder, saveOrderNote, setOrderStatus } from "../actions/orders";

type Status = "NEW" | "CONFIRMED" | "PAID" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

/** The next steps for an order: tell the customer, move it along, and keep a private note. */
export function OrderActions({ id, status, note, canEdit }: { id: string; status: Status; note: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(note ?? "");
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
            onClick={() => {
              const eta = window.prompt("When will it reach them?", "today evening");
              if (eta !== null) run(() => notifyOrder(id, "dispatch", eta));
            }}
          >
            Dispatch & message customer
          </Button>
        )}
        {status === "CONFIRMED" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setOrderStatus(id, "PAID"))}>
            Mark paid
          </Button>
        )}
        {status === "DISPATCHED" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setOrderStatus(id, "DELIVERED"))}>
            Mark delivered
          </Button>
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
      <div className="flex gap-2">
        <input className="field flex-1" placeholder="Note: payment mode, address, delivery slot…" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" variant="secondary" disabled={pending || text.trim() === (note ?? "")} onClick={() => run(() => saveOrderNote(id, text))}>
          Save
        </Button>
      </div>
    </div>
  );
}
