"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { openRazorpay } from "@/components/razorpay-checkout";
import { toast } from "@/components/toast";
import { rzpCancelTest, rzpConfirm, rzpTestOrder, rzpTestSubscription } from "../../dashboard/actions/razorpay";

/** ₹1 live payments that run the real checkout, signature check and webhook, and grant nothing. */
export function RazorpayTest({ hasTestSub }: { hasTestSub: boolean }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const run = (make: typeof rzpTestOrder) =>
    start(async () => {
      const s = await make();
      if (!s.ok) return toast(false, s.message);
      const out = await openRazorpay(s);
      if (out.status !== "paid") return toast(false, out.status === "failed" ? out.message : "Test closed before paying.");
      const r = await rzpConfirm({ kind: s.kind, id: s.id, paymentId: out.paymentId, signature: out.signature });
      toast(r.ok, r.message);
      router.refresh();
    });
  return (
    <div className="tools" style={{ flexWrap: "wrap", gap: 8 }}>
      <button type="button" className="btn sm primary" disabled={busy} onClick={() => run(rzpTestOrder)}>
        ₹1 one-time test
      </button>
      <button type="button" className="btn sm" disabled={busy} onClick={() => run(rzpTestSubscription)}>
        ₹1 auto-renew test
      </button>
      {hasTestSub && (
        <button
          type="button"
          className="btn sm ghost"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await rzpCancelTest();
              toast(r.ok, r.message);
              router.refresh();
            })
          }
        >
          Stop test auto-renew
        </button>
      )}
    </div>
  );
}
