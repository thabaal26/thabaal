"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, CheckRow, Field } from "@/components/ui";
import { saveRefillRule } from "../actions/orders";
import { templateLabel } from "@/lib/plain-error";

/** Admin setting: remind customers to reorder a set number of days after they bought. */
export function RefillForm({ days, templateId, templates }: { days: number | null; templateId: string | null; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(Boolean(days));
  const [n, setN] = useState(days ?? 30);
  const [tid, setTid] = useState(templateId ?? templates[0]?.id ?? "");
  return (
    <Card>
      <CardHeader
        title="Reorder reminders"
        description="Customers get a reminder this many days after an order, once, unless they've ordered again. Only orders from the last week before turning this on are included."
      />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await saveRefillRule(on ? n : 0, tid));
            router.refresh();
          });
        }}
      >
        <CheckRow label="Send reorder reminders" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field id="refill-days" label="Days after order">
            <input type="number" min={1} max={365} inputMode="numeric" className="field tabular" disabled={!on} value={n || ""} onChange={(e) => setN(Number(e.target.value))} />
          </Field>
          <Field id="refill-template" label="Template" help={on && !templates.length ? "No approved templates yet, so reminders can't be switched on." : undefined}>
            <select className="field" disabled={!on || !templates.length} value={tid} onChange={(e) => setTid(e.target.value)}>
              {templates.length ? templates.map((t) => <option key={t.id} value={t.id}>{templateLabel(t.name)}</option>) : <option>No approved templates yet</option>}
            </select>
          </Field>
        </div>
        <Button type="submit" className="max-sm:w-full" disabled={on && !tid} loading={pending}>
          Save
        </Button>
      </form>
    </Card>
  );
}
