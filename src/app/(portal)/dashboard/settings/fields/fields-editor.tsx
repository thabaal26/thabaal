"use client";

import { Plus, Trash2 } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { Button } from "@/components/ui";
import { FIELD_TYPES, fieldKey, type CustomField, type CustomFieldTarget, type CustomFieldType } from "@/lib/custom-fields";
import { saveCustomFields } from "../../actions/custom-fields";

type Row = { key: string; label: string; type: CustomFieldType; options: string; on: CustomFieldTarget; saved: boolean };

const toRow = (f: CustomField): Row => ({ key: f.key, label: f.label, type: f.type, options: (f.options ?? []).join(", "), on: f.on, saved: true });

/** Add, rename and remove the client's extra fields. Keys stay fixed once saved so values aren't lost. */
export function FieldsEditor({ initial }: { initial: CustomField[] }) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const fields: CustomField[] = rows
        .filter((r) => r.label.trim())
        .map((r) => ({
          key: r.saved ? r.key : fieldKey(r.label),
          label: r.label.trim(),
          type: r.type,
          on: r.on,
          ...(r.type === "select" && { options: r.options.split(",").map((o) => o.trim()).filter(Boolean) }),
        }));
      const res = await safeAction(() => saveCustomFields(fields));
      toastResult(res);
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted">No extra fields yet. Add the details your business keeps, like Birthday, GSTIN or PO number.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-card border border-line p-3 sm:grid-cols-[minmax(0,1.4fr)_8.5rem_8.5rem_minmax(0,1.4fr)_auto] sm:items-end">
          <label className="text-xs text-muted">
            Name
            <input className="field mt-1" value={r.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} placeholder="e.g. Birthday" />
          </label>
          <label className="text-xs text-muted">
            Kept on
            <select className="field mt-1" value={r.on} disabled={r.saved} onChange={(e) => set(i, { on: e.target.value as CustomFieldTarget })}>
              <option value="customer">Customers</option>
              <option value="order">Orders</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Type
            <select className="field mt-1" value={r.type} onChange={(e) => set(i, { type: e.target.value as CustomFieldType })}>
              {FIELD_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            {r.type === "select" ? "Choices, separated by commas" : " "}
            {r.type === "select" ? (
              <input className="field mt-1" value={r.options} onChange={(e) => set(i, { options: e.target.value })} placeholder="Veg, Non-veg" />
            ) : (
              <span className="mt-1 hidden h-10 sm:block" />
            )}
          </label>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${r.label || "field"}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}>
            <Trash2 aria-hidden className="size-4 shrink-0" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, { key: "", label: "", type: "text", options: "", on: "customer", saved: false }])}>
          <Plus aria-hidden className="size-4 shrink-0" /> Add field
        </Button>
        <Button type="button" size="sm" loading={pending} onClick={save}>
          Save fields
        </Button>
      </div>
      <p className="text-xs text-muted">Removing a field hides it; values already saved are kept and come back if you add a field with the same name.</p>
    </div>
  );
}
