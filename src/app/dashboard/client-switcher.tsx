"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toastResult } from "@/components/toast";
import { cn } from "@/lib/cn";
import { setActiveClient } from "./actions/clients";

/** Admin-only: choose which client's data the whole dashboard shows. */
export function ClientSwitcher({ clients, current, dark }: { clients: { id: string; name: string }[]; current: string | null; dark?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className={cn("flex items-center gap-2 rounded-lg px-2.5", dark ? "bg-white/10 text-white" : "border border-line bg-white text-ink")}>
      <Building2 className={cn("size-4 shrink-0", dark ? "text-emerald-300" : "text-brand-deep")} />
      <span className="sr-only">Client</span>
      <select
        value={current ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await setActiveClient(e.target.value);
            if (!r.ok) toastResult(r);
            router.refresh();
          })
        }
        className={cn("h-9 min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-medium outline-none", dark && "[&>option]:text-ink")}
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}
