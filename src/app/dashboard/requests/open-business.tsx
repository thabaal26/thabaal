"use client";

// Thabaal admin: switch into a business and open its My account, from the Requests page.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { setActiveClient } from "../actions/clients";

export function OpenBusiness({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="btn sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await setActiveClient(clientId);
          if (!r.ok) return toast(false, r.message ?? "Could not open this business.");
          router.push("/dashboard/account");
        })
      }
    >
      Open this business
    </button>
  );
}
