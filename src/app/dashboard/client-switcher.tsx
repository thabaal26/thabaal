"use client";

import { Building2, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toastResult } from "@/components/toast";
import { cn } from "@/lib/cn";
import { setActiveClient } from "./actions/clients";

/**
 * Phone header version: the title itself is the switcher, so admins don't lose a whole
 * row of screen to it. A native select sits invisibly on top for the OS picker.
 */
export function HeaderClientSwitcher({ clients, current, title, children }: { clients: { id: string; name: string }[]; current: string | null; title: string; children: ReactNode }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className={cn("relative min-w-0 flex-1", pending && "opacity-60")}>
      <p className="flex items-center gap-1 text-sm font-semibold leading-tight text-white">
        <span className="truncate">{title}</span>
        <ChevronDown className="size-4 shrink-0 text-white/60" />
      </p>
      {children}
      <select
        aria-label="Switch client"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await setActiveClient(e.target.value);
            if (!r.ok) toastResult(r);
            router.refresh();
          })
        }
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

/** Admin-only: choose which client's data the whole dashboard shows. */
export function ClientSwitcher({ clients, current, dark }: { clients: { id: string; name: string }[]; current: string | null; dark?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className={cn("flex items-center gap-2 rounded-lg px-2.5", dark ? "bg-white/10 text-white" : "border border-line bg-white text-ink")}>
      <Building2 className={cn("size-4 shrink-0", dark ? "text-glow" : "text-brand-deep")} />
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
