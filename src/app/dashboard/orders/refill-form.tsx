"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { saveRefillRule } from "../actions/orders";

/** Admin setting: remind customers to reorder a set number of days after they bought. */
export function RefillForm({ days, templateId, templates }: { days: number | null; templateId: string | null; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(Boolean(days));
  const [n, setN] = useState(days ?? 30);
  const [tid, setTid] = useState(templateId ?? templates[0]?.id ?? "");
  return (
    <Card className="mb-4">
      <CardHeader
        title="Refill reminders"
        description="Customers get a reminder this many days after an order, once, unless they've ordered again. Only orders from the last week before turning this on are included."
      />
      <form
        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await saveRefillRule(on ? n : 0, tid));
            router.refresh();
          });
        }}
      >
        <label className="flex items-center gap-2 text-sm font-medium sm:pb-2.5">
          <input type="checkbox" className="size-5 accent-brand sm:size-4" checked={on} onChange={(e) => setOn(e.target.checked)} /> On
        </label>
        <div className="sm:w-28">
          <Label htmlFor="refill-days">Days after order</Label>
          <input id="refill-days" type="number" min={1} max={365} className="field tabular" disabled={!on} value={n || ""} onChange={(e) => setN(Number(e.target.value))} />
        </div>
        <div className="flex-1">
          <Label htmlFor="refill-template">Template</Label>
          <select id="refill-template" className="field" disabled={!on || !templates.length} value={tid} onChange={(e) => setTid(e.target.value)}>
            {templates.length ? templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option>No approved templates yet</option>}
          </select>
        </div>
        <Button type="submit" disabled={pending || (on && !tid)}>Save</Button>
      </form>
    </Card>
  );
}
