"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { saveWinbackRule } from "../actions/orders";

/** Admin setting: when a customer counts as lapsed, and the message that tries to bring them back. */
export function WinbackForm({ days, templateId, templates, lapsed }: { days: number; templateId: string | null; templates: { id: string; name: string }[]; lapsed: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [n, setN] = useState(days);
  const [tid, setTid] = useState(templateId ?? "");
  return (
    <Card className="mb-4">
      <CardHeader
        title="Win back lapsed customers"
        description={`Customers with no order for this many days are tagged "lapsed" (${lapsed.toLocaleString("en-IN")} now). Pick a template to send each of them one message; they're untagged as soon as they order again.`}
      />
      <form
        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await saveWinbackRule(n, tid));
            router.refresh();
          });
        }}
      >
        <div className="sm:w-32">
          <Label htmlFor="wb-days">Lapsed after (days)</Label>
          <input id="wb-days" type="number" min={7} max={365} className="field tabular" value={n || ""} onChange={(e) => setN(Number(e.target.value))} />
        </div>
        <div className="flex-1">
          <Label htmlFor="wb-template">Win-back message</Label>
          <select id="wb-template" className="field" value={tid} onChange={(e) => setTid(e.target.value)}>
            <option value="">Don&apos;t send (tag only)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>Save</Button>
      </form>
    </Card>
  );
}
