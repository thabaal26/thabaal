"use client";

// Shown above every page while a Thabaal admin has a business open read-only (admin panel › Help a client).

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { leaveClientView } from "./actions/clients";

export function ViewOnlyBar({ name }: { name: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const leave = () =>
    start(async () => {
      const r = await leaveClientView();
      if (!r.ok) return toast(false, r.message ?? "Could not leave this view.");
      // Inside the admin panel's frame, go back there; in its own tab, open the admin panel.
      if (window.top && window.top !== window.self) window.top.location.href = "/admin/support";
      else router.push("/admin/support");
    });
  return (
    <div className="duebar warn" role="status" style={{ marginBottom: 16 }}>
      <span className="grow">
        <b>View only:</b> you are seeing {name}&apos;s app exactly as they see it. Nothing here can be changed.
      </span>
      <button type="button" className="btn sm" onClick={leave} disabled={busy}>
        Leave this view
      </button>
    </div>
  );
}
