"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { safeAction, toastResult } from "@/components/toast";
import { tagCustomers } from "../actions/customers";

/** "Send to this group": tags the group's customers, then opens a new campaign for that tag. */
export function GroupCampaign({ ids, tag }: { ids: string[]; tag: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn sm primary"
      disabled={pending}
      onClick={async () => {
        if (!(await confirmAction(`Tag these ${ids.length} customers “${tag}” and make a campaign for them?`))) return;
        start(async () => {
          const r = await safeAction(() => tagCustomers(ids, tag));
          toastResult(r);
          if (r.ok && r.tag) router.push(`/dashboard/campaigns/new?tag=${encodeURIComponent(r.tag)}`);
        });
      }}
    >
      {pending ? "Preparing…" : "Send to this group"}
    </button>
  );
}
