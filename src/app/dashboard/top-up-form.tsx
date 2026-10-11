"use client";

import { RefreshCw } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { addTopUp, refreshMetaLiveStatusAction, syncMetaAccountBalanceAction } from "./actions/spend";

/** Manager form: record money added to the WhatsApp account, sync Meta Billing Hub balance, or verify live Meta connection. */
export function TopUpForm({ clientId, wabaId }: { clientId: string; wabaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncing, startSync] = useTransition();
  const [checking, startCheck] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [syncVal, setSyncVal] = useState("");
  const [mode, setMode] = useState<"topup" | "sync">("topup");

  return (
    <div className="@container space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-control border border-line bg-sunken p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("topup")}
            className={`rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 font-medium transition ${
              mode === "topup" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            Add top-up
          </button>
          <button
            type="button"
            onClick={() => setMode("sync")}
            className={`rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 font-medium transition ${
              mode === "sync" ? "bg-panel text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            Sync Meta balance
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={checking}
          onClick={() =>
            startCheck(async () => {
              const r = await refreshMetaLiveStatusAction(clientId);
              toastResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          <RefreshCw aria-hidden className="size-3.5" /> Check Meta API
        </Button>
      </div>

      {mode === "topup" ? (
        <form
          className="grid gap-2.5 @md:grid-cols-[7.5rem_1fr_auto] @md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addTopUp(Number(amount), note);
              toastResult(r);
              if (r.ok) {
                setAmount("");
                setNote("");
                router.refresh();
              }
            });
          }}
        >
          <Field id="topup-amount" label="Amount added (₹)" required>
            <input
              className="field tabular"
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              value={amount}
              placeholder="1000"
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id="topup-note" label="Note" hint="optional">
            <input
              className="field"
              maxLength={200}
              value={note}
              placeholder="UPI to Meta, invoice no…"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button type="submit" size="sm" className="@max-md:w-full" disabled={!(Number(amount) > 0)} loading={pending}>
            Add top-up
          </Button>
        </form>
      ) : (
        <form
          className="grid gap-2.5 @sm:grid-cols-[1fr_auto] @sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            startSync(async () => {
              const r = await syncMetaAccountBalanceAction(wabaId, Number(syncVal));
              toastResult(r);
              if (r.ok) {
                setSyncVal("");
                router.refresh();
              }
            });
          }}
        >
          <Field id="sync-balance" label="Current balance on Meta Billing Hub (₹)" required>
            <input
              className="field tabular"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={syncVal}
              placeholder="e.g. 500.00"
              onChange={(e) => setSyncVal(e.target.value)}
            />
          </Field>
          <Button type="submit" size="sm" className="@max-sm:w-full" disabled={syncVal.trim() === "" || Number(syncVal) < 0} loading={syncing}>
            Sync balance
          </Button>
        </form>
      )}
    </div>
  );
}

