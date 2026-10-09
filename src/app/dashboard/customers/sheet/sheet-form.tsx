"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { saveSheetLinks, syncNow } from "../../actions/sheets";

export function SheetForm({ customersUrl, ordersUrl }: { customersUrl: string; ordersUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [c, setC] = useState(customersUrl);
  const [o, setO] = useState(ordersUrl);
  const run = (key: "save" | "sync", fn: () => ReturnType<typeof syncNow>) =>
    start(async () => {
      setBusy(key);
      toastResult(await fn());
      setBusy(null);
      router.refresh();
    });
  return (
    <form
      className="space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        run("save", () => saveSheetLinks(c, o));
      }}
    >
      <Field id="sheet-c" label="Link to the Customers tab" hint="optional">
        <input inputMode="url" autoComplete="off" className="field sm:text-xs" value={c} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" onChange={(e) => setC(e.target.value)} />
      </Field>
      <Field id="sheet-o" label="Link to the Orders tab" hint="optional">
        <input inputMode="url" autoComplete="off" className="field sm:text-xs" value={o} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=123456" onChange={(e) => setO(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} loading={busy === "save"}>Save & sync</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || (!customersUrl && !ordersUrl)}
          loading={busy === "sync"}
          title={!customersUrl && !ordersUrl ? "Save a sheet link first" : undefined}
          onClick={() => run("sync", syncNow)}
        >
          <RefreshCw aria-hidden className="size-4" /> Sync now
        </Button>
      </div>
    </form>
  );
}
