"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Clock3D } from "@/components/icons-3d";
import { safeAction, toastResult } from "@/components/toast";
import { Button, Card, CardHeader, CheckRow, Field } from "@/components/ui";
import { saveRefillRule } from "../actions/orders";
import { templateLabel } from "@/lib/plain-error";
import { useLanguage } from "@/lib/i18n/context";

/** Admin setting: remind customers to reorder a set number of days after they bought. */
export function RefillForm({ days, templateId, templates }: { days: number | null; templateId: string | null; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(Boolean(days));
  const [n, setN] = useState(days ?? 30);
  const [tid, setTid] = useState(templateId ?? templates[0]?.id ?? "");
  return (
    <Card className="card-3d">
      <CardHeader
        tone="brand"
        icon={<Clock3D />}
        title="Reorder reminders"
        titleTa="மறு ஆர்டர் நினைவூட்டல்கள்"
        description="Customers get a reminder this many days after an order, once, unless they've ordered again. Only orders from the last week before turning this on are included."
        descriptionTa="வாடிக்கையாளர் ஆர்டர் செய்து குறிப்பிட்ட நாட்களுக்குப் பிறகு ஒருமுறை நினைவூட்டல் அனுப்பப்படும்."
      />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await safeAction(() => saveRefillRule(on ? n : 0, tid)));
            router.refresh();
          });
        }}
      >
        <CheckRow
          label={isTamil ? "மறு ஆர்டர் நினைவூட்டல்களை அனுப்புக" : "Send reorder reminders"}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field id="refill-days" label={isTamil ? "ஆர்டருக்குப் பின் (நாட்கள்)" : "Days after order"}>
            <input type="number" min={1} max={365} inputMode="numeric" className="field tabular" disabled={!on} value={n || ""} onChange={(e) => setN(Number(e.target.value))} />
          </Field>
          <Field
            id="refill-template"
            label={isTamil ? "டெம்ப்ளேட்" : "Template"}
            help={on && !templates.length ? (isTamil ? "அங்கீகரிக்கப்பட்ட டெம்ப்ளேட்கள் இல்லை." : "No approved templates yet, so reminders can't be switched on.") : undefined}
          >
            <select className="field" disabled={!on || !templates.length} value={tid} onChange={(e) => setTid(e.target.value)}>
              {templates.length ? (
                templates.map((t) => <option key={t.id} value={t.id}>{templateLabel(t.name)}</option>)
              ) : (
                <option>{isTamil ? "அங்கீகரிக்கப்பட்ட டெம்ப்ளேட்கள் இல்லை" : "No approved templates yet"}</option>
              )}
            </select>
          </Field>
        </div>
        <Button type="submit" className="max-sm:w-full" disabled={on && !tid} loading={pending}>
          {isTamil ? "சேமிக்க" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
