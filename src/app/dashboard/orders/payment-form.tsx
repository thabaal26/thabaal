"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Field } from "@/components/ui";
import { savePaymentConfig } from "../actions/orders";

/** Manager setting: which WhatsApp payment configuration "Request payment" uses. */
export function PaymentForm({ config, own, using }: { config: string | null; own: { name: string; status: string | null }; using: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(config ?? "");
  return (
    <Card>
      <CardHeader
        title="WhatsApp payments (UPI)"
        description={`New WhatsApp carts get a "Review and pay" request automatically (one reminder after 6 hours if unpaid), and paid orders turn PAID on their own. After 24 hours without a message from them it sends a template: ${
          using ? `now using "${using}"` : "none approved yet, so add one from Meta's Template library and sync templates"
        }${using === own.name ? "" : ` (your "${own.name}" is ${own.status ? own.status.toLowerCase() : "not created yet"}; it takes over once approved)`}.`}
      />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await savePaymentConfig(name));
            router.refresh();
          });
        }}
      >
        <Field id="pay-config" label="Payment configuration name" help="Find it in WhatsApp Manager → Payment configurations.">
          <input className="field" autoComplete="off" value={name} placeholder="rgfoodproducts" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" className="max-sm:w-full" disabled={name.trim() === (config ?? "")} loading={pending}>
          Save
        </Button>
      </form>
    </Card>
  );
}
