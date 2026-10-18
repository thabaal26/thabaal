"use client";

import { ChevronDown, ChevronUp, Link as LinkIcon, RefreshCw, Sparkles } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { saveSheetLinks, syncNow } from "../../actions/sheets";

export function SheetForm({ customersUrl, ordersUrl }: { customersUrl: string; ordersUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);

  // If both URLs are identical or only one is set, default to single-link mode
  const isSingle = !ordersUrl || customersUrl === ordersUrl;
  const [singleUrl, setSingleUrl] = useState(customersUrl || ordersUrl || "");
  const [c, setC] = useState(customersUrl);
  const [o, setO] = useState(ordersUrl);
  const [useSeparate, setUseSeparate] = useState(!isSingle && !!(customersUrl && ordersUrl));

  const run = (key: "save" | "sync", fn: () => ReturnType<typeof syncNow>) =>
    start(async () => {
      setBusy(key);
      toastResult(await fn());
      setBusy(null);
      router.refresh();
    });

  const handleSave = () => {
    if (useSeparate) {
      run("save", () => saveSheetLinks(c, o));
    } else {
      run("save", () => saveSheetLinks(singleUrl, singleUrl));
    }
  };

  const hasAnyLink = useSeparate ? !!(c.trim() || o.trim()) : !!singleUrl.trim();

  return (
    <form
      className="space-y-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {!useSeparate ? (
        <div className="space-y-2">
          <Field
            id="sheet-single"
            label="Google Sheet Share Link"
            hint="Easiest: syncs Customers & Orders"
          >
            <div className="relative">
              <input
                inputMode="url"
                autoComplete="off"
                className="field pl-9 sm:text-xs"
                value={singleUrl}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit?usp=sharing"
                onChange={(e) => {
                  setSingleUrl(e.target.value);
                  setC(e.target.value);
                  setO(e.target.value);
                }}
              />
              <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            </div>
          </Field>
          <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted">
            <Sparkles aria-hidden className="size-3.5 shrink-0 text-gold" />
            Paste your Google Sheet share link here. We automatically detect and sync both the <b>Customers</b> and <b>Orders</b> tabs!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field id="sheet-c" label="Link to Customers tab" hint="optional">
            <input
              inputMode="url"
              autoComplete="off"
              className="field sm:text-xs"
              value={c}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
              onChange={(e) => setC(e.target.value)}
            />
          </Field>
          <Field id="sheet-o" label="Link to Orders tab" hint="optional">
            <input
              inputMode="url"
              autoComplete="off"
              className="field sm:text-xs"
              value={o}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=123456"
              onChange={(e) => setO(e.target.value)}
            />
          </Field>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setUseSeparate(!useSeparate)}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 underline underline-offset-2 transition hover:text-ink"
        >
          {useSeparate ? (
            <>
              Switch back to single Share link <ChevronUp className="size-3 shrink-0" />
            </>
          ) : (
            <>
              Need separate links for Customers & Orders? <ChevronDown className="size-3 shrink-0" />
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={pending || !hasAnyLink} loading={busy === "save"}>
          Save & sync
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !hasAnyLink}
          loading={busy === "sync"}
          title={!hasAnyLink ? "Save a sheet link first" : undefined}
          onClick={() => run("sync", syncNow)}
        >
          <RefreshCw aria-hidden className="size-4 shrink-0" /> Sync now
        </Button>
      </div>
    </form>
  );
}
