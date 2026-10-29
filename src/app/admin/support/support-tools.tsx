"use client";

// Admin panel › Help a client: open a business's own app read-only, leave that view, or open it to make changes.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { leaveClientView, setActiveClient, viewClientAs } from "../../dashboard/actions/clients";

export function LeaveViewButton({ label = "Leave this view", className = "btn sm" }: { label?: string; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await leaveClientView();
          if (!r.ok) return toast(false, r.message ?? "Could not leave this view.");
          router.refresh();
        })
      }
    >
      {label}
    </button>
  );
}

/** Pick a business by typing or from the list, then open its app read-only below. */
export function SupportPicker({ clients, current }: { clients: { id: string; name: string; sub: string }[]; current: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(current ?? "");
  const open = (id: string) =>
    start(async () => {
      if (!id) return toast(false, "Pick a business first.");
      const r = await viewClientAs(id);
      if (!r.ok) return toast(false, r.message ?? "Could not open this business.");
      router.refresh();
    });
  const typed = () => {
    const t = q.trim().toLowerCase();
    const hit = clients.find((c) => c.name.toLowerCase() === t) ?? clients.find((c) => `${c.name} ${c.sub}`.toLowerCase().includes(t));
    return hit?.id ?? sel;
  };
  return (
    <div className="formgrid" style={{ gridTemplateColumns: "1.4fr .9fr auto", alignItems: "end" }}>
      <div className="field">
        <label htmlFor="svq">Business, owner or town</label>
        <input id="svq" type="text" list="svlist" placeholder="Start typing a name" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <datalist id="svlist">
          {clients.map((c) => (
            <option key={c.id} value={c.name}>
              {c.sub}
            </option>
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="svsel">Or choose from the list</label>
        <select id="svsel" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Choose a business</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn primary" disabled={busy} onClick={() => open(q.trim() ? typed() : sel)}>
        Open their app
      </button>
    </div>
  );
}

/** The old admin way in: switch into the business with full rights and open its dashboard. */
export function OpenToChange({ clientId, href = "/dashboard", label = "Open to make changes", className = "btn sm" }: { clientId: string; href?: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await setActiveClient(clientId);
          if (!r.ok) return toast(false, r.message ?? "Could not open this business.");
          router.push(href);
        })
      }
    >
      {label}
    </button>
  );
}

/** Portal-wide settings live in the dashboard's Settings with no business picked. */
export function OpenPortalSettings() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="btn sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await setActiveClient("");
          if (!r.ok) return toast(false, r.message ?? "Could not open settings.");
          router.push("/dashboard/settings");
        })
      }
    >
      Sending and look settings
    </button>
  );
}

/** Opens a business's app read-only (from a client page). */
export function ViewAsButton({ clientId, className = "btn sm primary" }: { clientId: string; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await viewClientAs(clientId);
          if (!r.ok) return toast(false, r.message ?? "Could not open this business.");
          router.push("/admin/support");
        })
      }
    >
      See their app
    </button>
  );
}
