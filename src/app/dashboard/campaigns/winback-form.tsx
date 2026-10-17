"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles3D } from "@/components/icons-3d";
import { safeAction, toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Field } from "@/components/ui";
import { saveWinbackRule } from "../actions/orders";
import { templateLabel } from "@/lib/plain-error";
import { useLanguage } from "@/lib/i18n/context";

/** Admin setting: when a customer counts as lapsed, and the message that tries to bring them back. */
export function WinbackForm({
  days,
  templateId,
  templates,
  lapsed,
}: {
  days: number;
  templateId: string | null;
  templates: { id: string; name: string }[];
  lapsed: number;
}) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [pending, start] = useTransition();
  const [n, setN] = useState(days);
  const [tid, setTid] = useState(templateId ?? "");

  return (
    <Card className="card-3d">
      <CardHeader
        tone="gold"
        icon={<Sparkles3D />}
        title="Win back lapsed customers"
        titleTa="பழைய வாடிக்கையாளர்களை மீண்டும் அழைக்க"
        description={`Customers with no order for this many days are tagged "lapsed" (${lapsed.toLocaleString(
          "en-IN"
        )} currently). Pick a template to automatically send each of them one re-engagement message; they are untagged as soon as they order again.`}
        descriptionTa={`குறிப்பிட்ட நாட்களாக வாங்காத வாடிக்கையாளர்களுக்கு சிறப்பு சலுகையுடன் கூடிய செய்தியை அனுப்பி மீண்டும் வரவழைக்கலாம் (தற்போது ${lapsed.toLocaleString("en-IN")} வாடிக்கையாளர்கள்).`}
      />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            toastResult(await safeAction(() => saveWinbackRule(n, tid)));
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field id="wb-days" label={isTamil ? "இடைவெளி நாட்கள்" : "Lapsed after (days)"}>
            <input
              type="number"
              min={7}
              max={365}
              inputMode="numeric"
              className="field tabular"
              value={n || ""}
              onChange={(e) => setN(Number(e.target.value))}
            />
          </Field>
          <Field id="wb-template" label={isTamil ? "மீண்டும் அழைக்கும் செய்தி டெம்ப்ளேட்" : "Win-back campaign message"}>
            <select
              className="field"
              value={tid}
              onChange={(e) => setTid(e.target.value)}
            >
              <option value="">{isTamil ? "செய்தி அனுப்ப வேண்டாம் (குறிச்சொல் மட்டும்)" : "Don't send (tag only)"}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {templateLabel(t.name)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" className="max-sm:w-full" loading={pending}>
          {isTamil ? "அமைப்புகளைச் சேமிக்க" : "Save win-back settings"}
        </Button>
      </form>
    </Card>
  );
}
