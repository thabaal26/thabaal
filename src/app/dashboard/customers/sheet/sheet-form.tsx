"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { saveSheetLinks, syncNow } from "../../actions/sheets";

export function SheetForm({ customersUrl, ordersUrl }: { customersUrl: string; ordersUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [c, setC] = useState(customersUrl);
  const [o, setO] = useState(ordersUrl);
  const run = (fn: () => ReturnType<typeof syncNow>) =>
    start(async () => {
      toastResult(await fn());
      router.refresh();
    });
  return (
    <form
      className="space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSheetLinks(c, o));
      }}
    >
      <div>
        <Label htmlFor="sheet-c" hint="optional">Link to the Customers tab</Label>
        <input id="sheet-c" className="field text-xs" value={c} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" onChange={(e) => setC(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="sheet-o" hint="optional">Link to the Orders tab</Label>
        <input id="sheet-o" className="field text-xs" value={o} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=123456" onChange={(e) => setO(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} Save & sync</Button>
        <Button type="button" variant="secondary" disabled={pending || (!customersUrl && !ordersUrl)} onClick={() => run(syncNow)}>
          <RefreshCw className="size-4" /> Sync now
        </Button>
      </div>
    </form>
  );
}
