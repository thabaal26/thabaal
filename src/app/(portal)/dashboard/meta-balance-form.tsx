"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { syncMetaAccountBalanceAction } from "./actions/spend";
import { T } from "./portal-ui";

/**
 * Home › WhatsApp spend: the manager types the balance Meta's Billing Hub shows ("Available funds").
 * Meta has no API for the balance, so from then on the card takes off Meta's own charges as they happen.
 */
export function MetaBalanceForm({ wabaId, hasBalance }: { wabaId: string; hasBalance: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        {hasBalance ? <T ta="இருப்பைப் புதுப்பி">Update balance</T> : <T ta="மெட்டா இருப்பைச் சேர்">Add Meta balance</T>}
      </button>
    );

  return (
    <form
      style={{ width: "100%", marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await safeAction(() => syncMetaAccountBalanceAction(wabaId, Number(val)));
          toastResult(r);
          if (r.ok) {
            setVal("");
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <div className="field">
        <label htmlFor="meta-balance">
          <T ta="மெட்டா Billing Hub-ல் இப்போது உள்ள இருப்பு (₹)">Balance on Meta Billing Hub now (₹)</T>
        </label>
        <input
          id="meta-balance"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          required
          value={val}
          placeholder="e.g. 850.00"
          onChange={(e) => setVal(e.target.value)}
        />
      </div>
      <p className="muted small" style={{ margin: "6px 0 8px" }}>
        <T ta="Billing Hub-ல் 'Available funds' எண்ணை அப்படியே போடுங்கள். அதன் பிறகு ஒவ்வொரு கட்டணமும் தானாகக் கழிக்கப்படும்.">
          Copy &quot;Available funds&quot; from Billing Hub. After that, Meta&apos;s charges are taken off automatically.
        </T>
      </p>
      <div className="tools">
        <button type="submit" className="btn primary sm" disabled={pending || val.trim() === "" || Number(val) < 0}>
          {pending ? "…" : <T ta="சேமி">Save</T>}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)} disabled={pending}>
          <T ta="ரத்து">Cancel</T>
        </button>
      </div>
    </form>
  );
}
