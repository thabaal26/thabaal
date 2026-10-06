"use client";

import { Ban, FileUp, Loader2, MoreHorizontal, Trash2, UserCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { Button, Label } from "@/components/ui";
import { importCustomers, saveCustomer } from "../actions/customers";

export function CustomerTools() {
  const [open, setOpen] = useState<"add" | "import" | null>(null);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(open === "import" ? null : "import")}>
        <FileUp className="size-4" /> Import CSV
      </Button>
      <Button onClick={() => setOpen(open === "add" ? null : "add")}>
        <UserPlus className="size-4" /> Add customer
      </Button>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open === "add" ? "Add customer" : "Import customers"}>
        {open === "add" ? <AddForm done={() => setOpen(null)} /> : <ImportForm done={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}

const CONSENT = ["Bought from us and gave their number", "Signed up at the shop or stall", "Messaged us on WhatsApp first", "Website or online form", "Asked to join over the phone"];

/** Meta requires customers to have agreed to WhatsApp messages; this records how. */
function ConsentField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id} hint="Meta requires their agreement">How they agreed to messages</Label>
      <input id={id} list={`${id}-opts`} className="field" required value={value} onChange={(e) => onChange(e.target.value)} placeholder="Bought from us and gave their number" />
      <datalist id={`${id}-opts`}>{CONSENT.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}

function AddForm({ done }: { done: () => void }) {
  const [v, setV] = useState({ name: "", phone: "", tags: "", optInSource: CONSENT[0] });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCustomer(null, v);
          toastResult(r);
          if (r.ok) { done(); router.refresh(); }
        });
      }}
    >
      <div><Label htmlFor="n">Name</Label><input id="n" autoComplete="name" autoCapitalize="words" className="field" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label htmlFor="p" hint="10-digit numbers get +91">WhatsApp number</Label><input id="p" type="tel" inputMode="tel" autoComplete="tel" className="field" required placeholder="+91 98765 43210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      <div><Label htmlFor="t" hint="comma separated, optional">Tags</Label><input id="t" className="field" placeholder="vip, chennai" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></div>
      <ConsentField id="consent-add" value={v.optInSource} onChange={(optInSource) => setV({ ...v, optInSource })} />
      <Button className="w-full" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Add customer"}</Button>
    </form>
  );
}

function ImportForm({ done }: { done: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [consent, setConsent] = useState(CONSENT[0]);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        start(async () => {
          const r = await importCustomers(await file.text(), tags, consent);
          toastResult(r);
          if (r.ok) { done(); router.refresh(); }
        });
      }}
    >
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-brand hover:bg-brand-soft/30">
        <FileUp className="size-6 text-brand" />
        <span className="text-sm font-medium">{file ? file.name : "Choose a .csv file"}</span>
        <span className="text-xs text-muted">Columns: <code>name, phone, tags</code>. Existing numbers are updated, not duplicated.</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div><Label htmlFor="it" hint="optional">Add these tags to everyone</Label><input id="it" className="field" placeholder="october-list" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
      <ConsentField id="consent-import" value={consent} onChange={setConsent} />
      <p className="text-xs text-muted">
        Excel: File → Save As → CSV UTF-8. <a className="font-medium text-brand-deep underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("name,phone,tags\nPriya Sharma,9876543210,vip\nArjun Rao,+91 91234 56789,\n")}`} download="customers-sample.csv">Download a sample</a>
      </p>
      <Button className="w-full" disabled={pending || !file}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Import"}</Button>
    </form>
  );
}

type Result = { ok: boolean; message?: string; errors?: string[] };

/** Per-customer actions on phones, opened from a "⋯" button. */
export function CustomerMenu({ name, optedOut, toggle, remove }: { name: string; optedOut: boolean; toggle: () => Promise<Result>; remove: () => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      toastResult(await fn());
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`Actions for ${name}`} className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted active:bg-canvas">
        <MoreHorizontal className="size-5" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-start" disabled={pending} onClick={() => run(toggle)}>
            {optedOut ? <UserCheck className="size-4" /> : <Ban className="size-4" />}
            {optedOut ? "Opt back in to campaigns" : "Opt out of campaigns"}
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            disabled={pending}
            onClick={() => window.confirm(`Delete ${name} and their message history?`) && run(remove)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete customer
          </Button>
        </div>
      </Sheet>
    </>
  );
}
