"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui";
import { showValue, type CustomField } from "@/lib/custom-fields";
import { updateOrderExtra } from "../actions/orders";

/** The client's custom order fields: shown on the order card, edited in a sheet. */
export function OrderExtra({ orderId, fields, values, canEdit }: { orderId: string; fields: CustomField[]; values: Record<string, string>; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!fields.length) return null;
  const shown = fields.filter((f) => values[f.key]);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {shown.map((f) => (
        <span key={f.key} className="text-muted">
          {f.label}: <span className="text-ink">{showValue(f, values[f.key])}</span>
        </span>
      ))}
      {canEdit && (
        <button
          type="button"
          className="font-medium text-brand-deep hover:underline"
          onClick={() => {
            setDraft(values);
            setOpen(true);
          }}
        >
          {shown.length ? "Edit details" : "Add details"}
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Order details">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await updateOrderExtra(orderId, draft);
              toastResult(r);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          <CustomFieldInputs fields={fields} values={draft} onChange={setDraft} idPrefix={`of-${orderId}`} />
          <Button type="submit" loading={pending} className="w-full">
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
