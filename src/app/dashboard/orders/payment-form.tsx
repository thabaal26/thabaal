"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { savePaymentConfig } from "../actions/orders";

/** Manager setting: which WhatsApp payment configuration "Request payment" uses. */
export function PaymentForm({ config, own, using }: { config: string | null; own: { name: string; status: string | null }; using: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(config ?? "");
  return (
    <Card className="mb-4">
      <CardHeader
        title="WhatsApp payments (UPI)"
        description={`New WhatsApp carts get a "Review and pay" request automatically (one reminder after 6 hours if unpaid), and paid orders turn PAID on their own. After 24 hours without a message from them it sends a template: ${
          using ? `now using "${using}"` : "none approved yet, so add one from Meta's Template library and sync templates"
        }${using === own.name ? "" : ` (your "${own.name}" is ${own.status ? own.status.toLowerCase() : "not created yet"}; it takes over once approved)`}.`}
      />
      <form
        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await savePaymentConfig(name));
            router.refresh();
          });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="pay-config" hint="WhatsApp Manager → Payment configurations">Payment configuration name</Label>
          <input id="pay-config" className="field" value={name} placeholder="rgfoodproducts" onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" disabled={pending || name.trim() === (config ?? "")}>Save</Button>
      </form>
    </Card>
  );
}
