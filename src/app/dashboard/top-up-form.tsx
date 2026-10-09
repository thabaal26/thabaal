"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { addTopUp } from "./actions/spend";

/** Manager form: record money added to the WhatsApp account in Meta's billing. */
export function TopUpForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="grid gap-3 @md:grid-cols-[8rem_1fr_auto] @md:items-end"
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
        <input className="field tabular" type="number" min={1} step="0.01" inputMode="decimal" value={amount} placeholder="1000" onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field id="topup-note" label="Note" hint="optional">
        <input className="field" maxLength={200} value={note} placeholder="UPI to Meta, invoice no…" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" disabled={!(Number(amount) > 0)} loading={pending}>
        Add top-up
      </Button>
    </form>
  );
}
