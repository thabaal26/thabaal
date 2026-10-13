"use client";

import { Field } from "@/components/ui";
import type { CustomField } from "@/lib/custom-fields";

/** Inputs for a client's custom fields (customer or order forms). */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
  idPrefix,
}: {
  fields: CustomField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  idPrefix: string;
}) {
  if (!fields.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.key}`;
        const value = values[f.key] ?? "";
        const set = (v: string) => onChange({ ...values, [f.key]: v });
        return (
          <Field key={f.key} id={id} label={f.label} hint="optional">
            {f.type === "select" ? (
              <select id={id} className="field" value={value} onChange={(e) => set(e.target.value)}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className="field"
                type={f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}
