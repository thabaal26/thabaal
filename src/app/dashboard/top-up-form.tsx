"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { addTopUp } from "./actions/spend";

/** Manager form: record money added to the WhatsApp account in Meta's billing. */
export function TopUpForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
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
      <div className="sm:w-36">
        <Label htmlFor="topup-amount">Amount added (₹)</Label>
        <input id="topup-amount" className="field tabular" type="number" min={1} step="0.01" inputMode="decimal" required value={amount} placeholder="1000" onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex-1">
        <Label htmlFor="topup-note" hint="optional">Note</Label>
        <input id="topup-note" className="field" maxLength={200} value={note} placeholder="UPI to Meta, invoice no…" onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !(Number(amount) > 0)}>Add top-up</Button>
    </form>
  );
}
