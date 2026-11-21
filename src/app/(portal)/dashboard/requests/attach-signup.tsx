"use client";

// Thabaal admin: attach a WhatsApp account shared through Meta's hosted sign-up to one Thabaal business, or hide it.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { attachMetaSignup, ignoreMetaSignup } from "../actions/meta-signup";

export type AttachChoice = { id: string; name: string; numbers: number };

export function AttachSignup({ signupId, choices, ready, suggestedId }: { signupId: string; choices: AttachChoice[]; ready: boolean; suggestedId?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [clientId, setClientId] = useState(suggestedId ?? "");

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok, r.message ?? (r.ok ? "Done." : "Something went wrong."));
      router.refresh();
    });

  return (
    <div className="tools" style={{ flexWrap: "wrap" }}>
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Thabaal business" disabled={busy} style={{ minWidth: 200 }}>
        <option value="">Pick the business...</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id} disabled={c.numbers > 0}>
            {c.name}
            {c.numbers > 0 ? " (already connected)" : ""}
          </option>
        ))}
      </select>
      <button type="button" className="btn sm primary" disabled={busy || !clientId || !ready} title={ready ? undefined : "Add META_SYSTEM_USER_TOKEN in Vercel first"} onClick={() => run(() => attachMetaSignup(signupId, clientId))}>
        Attach
      </button>
      <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => ignoreMetaSignup(signupId))}>
        Not ours: hide
      </button>
    </div>
  );
}
