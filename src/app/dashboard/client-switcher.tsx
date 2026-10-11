"use client";

import { Building2, ChevronDown } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Picker } from "@/components/picker";
import { toastResult } from "@/components/toast";
import { cn } from "@/lib/cn";
import { setActiveClient } from "./actions/clients";

type Clients = { id: string; name: string }[];

const options = (clients: Clients) => [
  { value: "", label: "All clients", hint: "Every client's data together" },
  ...clients.map((c) => ({ value: c.id, label: c.name })),
];

function useSwitch() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const change = (id: string) =>
    start(async () => {
      const r = await setActiveClient(id);
      if (!r.ok) toastResult(r);
      router.refresh();
    });
  return { pending, change };
}

/**
 * Phone header version: the title itself is the switcher, so admins don't lose a whole
 * row of screen to it. Tapping it opens the client list as a bottom sheet.
 */
export function HeaderClientSwitcher({ clients, current, title, children }: { clients: Clients; current: string | null; title: string; children: ReactNode }) {
  const { pending, change } = useSwitch();
  return (
    <Picker
      title="Switch client"
      value={current ?? ""}
      onChange={change}
      disabled={pending}
      options={options(clients)}
      className={cn("-my-1 min-h-11 min-w-0 flex-1 rounded-control py-1", pending && "opacity-60")}
      trigger={() => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold leading-tight text-white">
            <span className="truncate">{title}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-white/70" />
          </span>
          {children}
        </span>
      )}
    />
  );
}

/** Admin-only: choose which client's data the whole dashboard shows. */
export function ClientSwitcher({ clients, current, dark }: { clients: Clients; current: string | null; dark?: boolean }) {
  const { pending, change } = useSwitch();
  return (
    <Picker
      title="Switch client"
      value={current ?? ""}
      onChange={change}
      disabled={pending}
      options={options(clients)}
      className={cn("w-full", pending && "opacity-60")}
      trigger={(selected) => (
        <span className={cn("flex h-10 items-center gap-2 rounded-control px-2.5 text-sm font-medium transition", dark ? "border border-white/10 bg-white/[0.04] text-white hover:bg-white/10" : "border border-line-strong/60 bg-panel/90 text-ink shadow-xs")}>
          <Building2 aria-hidden className={cn("size-4 shrink-0", dark ? "text-glow" : "text-brand-deep")} />
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? "All clients"}</span>
          <ChevronDown aria-hidden className={cn("size-4 shrink-0", dark ? "text-white/70" : "text-muted")} />
        </span>
      )}
    />
  );
}
