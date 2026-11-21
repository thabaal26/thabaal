"use client";

// Admin panel › Settings: whether one business must have a paid plan to use thabaal (Client.planRequired).

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { requirePaidPlan } from "../../dashboard/actions/account";

export function PlanRequiredToggle({ clientId, name, required }: { clientId: string; name: string; required: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="sw"
      role="switch"
      aria-checked={required}
      aria-label={`${name} needs a paid plan`}
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await requirePaidPlan(clientId, !required);
          toast(r.ok, r.message || (r.ok ? "Saved." : "Could not save."));
          if (r.ok) router.refresh();
        })
      }
    />
  );
}
