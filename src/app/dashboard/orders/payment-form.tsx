"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { savePaymentConfig } from "../actions/orders";

/** Manager setting: which WhatsApp payment configuration "Request payment" uses. */
export function PaymentForm({ config, template }: { config: string | null; template: { name: string; status: string | null } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(config ?? "");
  return (
    <Card className="mb-4">
      <CardHeader
        title="WhatsApp payments (UPI)"
        description={`Customers get a "Review and pay" button for their order and pay by UPI inside WhatsApp. After 24 hours without a message from them, this needs the "${template.name}" order details template (${template.status ? template.status.toLowerCase() : "not created yet"}).`}
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
