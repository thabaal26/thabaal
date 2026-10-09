"use client";

import { Ban, ChevronRight, FileUp, MoreHorizontal, QrCode, Sheet as SheetIcon, Trash2, UserCheck, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { Button, buttonClass, Field } from "@/components/ui";
import { cn } from "@/lib/cn";
import { importCustomers, saveCustomer } from "../actions/customers";

const LINKS = [
  { href: "/dashboard/customers/grow", label: "Get more customers", icon: QrCode, manager: false },
  { href: "/dashboard/customers/sheet", label: "Google Sheet", icon: SheetIcon, manager: false },
  { href: "/dashboard/customers/audiences", label: "Audiences", icon: UsersRound, manager: true },
];

/**
 * The customers page's actions. Computers show them all; phones keep "Add customer"
 * beside the title and put the rest in a "More" sheet.
 */
export function CustomerActions({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState<"add" | "import" | "more" | null>(null);
  const links = LINKS.filter((l) => canManage || !l.manager);
  return (
    <>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cn(buttonClass("secondary"), "max-sm:hidden")}>
          <Icon aria-hidden className="size-4" /> {label}
        </Link>
      ))}
      {canManage && (
        <>
          <Button variant="secondary" className="max-sm:hidden" onClick={() => setOpen("import")}>
            <FileUp aria-hidden className="size-4" /> Import CSV
          </Button>
          <Button onClick={() => setOpen("add")} className="max-sm:px-3.5">
            <UserPlus aria-hidden className="size-4" /> Add<span className="max-sm:sr-only"> customer</span>
          </Button>
        </>
      )}
      <Button variant="secondary" icon className="sm:hidden" aria-label="More customer tools" onClick={() => setOpen("more")}>
        <MoreHorizontal aria-hidden className="size-5" />
      </Button>

      <Sheet open={open === "more"} onClose={() => setOpen(null)} title="Customer tools">
        <ul className="-mx-2 space-y-0.5">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center gap-3 rounded-control px-3 text-md font-medium text-ink transition active:bg-sunken">
                <Icon aria-hidden className="size-5 text-brand-deep" />
                <span className="flex-1">{label}</span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </li>
          ))}
          {canManage && (
            <li>
              <button type="button" onClick={() => setOpen("import")} className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-md font-medium text-ink transition active:bg-sunken">
                <FileUp aria-hidden className="size-5 text-brand-deep" />
                <span className="flex-1">Import CSV</span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </button>
            </li>
          )}
        </ul>
      </Sheet>
      <Sheet open={open === "add" || open === "import"} onClose={() => setOpen(null)} title={open === "add" ? "Add customer" : "Import customers"}>
        {open === "add" ? <AddForm done={() => setOpen(null)} /> : <ImportForm done={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}

const CONSENT = ["Bought from us and gave their number", "Signed up at the shop or stall", "Messaged us on WhatsApp first", "Website or online form", "Asked to join over the phone"];

/** Meta requires customers to have agreed to WhatsApp messages; this records how. */
function ConsentField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field id={id} label="How they agreed to messages" hint="Meta requires their agreement" required>
      <input list={`${id}-opts`} className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Bought from us and gave their number" />
    </Field>
  );
}

function ConsentOptions({ id }: { id: string }) {
  return <datalist id={`${id}-opts`}>{CONSENT.map((c) => <option key={c} value={c} />)}</datalist>;
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
      <Field id="n" label="Name" required>
        <input autoComplete="name" autoCapitalize="words" className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field id="p" label="WhatsApp number" hint="10-digit numbers get +91" required>
        <input type="tel" inputMode="tel" autoComplete="tel" className="field" placeholder="+91 98765 43210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </Field>
      <Field id="t" label="Tags" hint="comma separated, optional">
        <input className="field" placeholder="vip, chennai" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} />
      </Field>
      <ConsentField id="consent-add" value={v.optInSource} onChange={(optInSource) => setV({ ...v, optInSource })} />
      <ConsentOptions id="consent-add" />
      <Button type="submit" className="w-full" loading={pending}>Add customer</Button>
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
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-line-strong/60 px-4 py-8 text-center transition hover:border-brand hover:bg-brand-soft/30 has-focus-visible:border-brand-deep">
        <FileUp aria-hidden className="size-6 text-brand-deep" />
        <span className="text-sm font-medium text-ink">{file ? file.name : "Choose a .csv file"}</span>
        <span className="text-xs text-muted">Columns: <code>name, phone, tags</code>. Existing numbers are updated, not duplicated.</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Field id="it" label="Add these tags to everyone" hint="optional">
        <input className="field" placeholder="october-list" value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <ConsentField id="consent-import" value={consent} onChange={setConsent} />
      <ConsentOptions id="consent-import" />
      <p className="text-xs text-muted">
        Excel: File → Save As → CSV UTF-8.{" "}
        <a className="font-medium text-brand-deep underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("name,phone,tags\nPriya Sharma,9876543210,vip\nArjun Rao,+91 91234 56789,\n")}`} download="customers-sample.csv">
          Download a sample
        </a>
      </p>
      <Button type="submit" className="w-full" disabled={!file} loading={pending} title={!file ? "Choose a .csv file first" : undefined}>
        Import
      </Button>
    </form>
  );
}

type Result = { ok: boolean; message?: string; errors?: string[] };

/** Per-customer actions on phones, opened from a "⋯" button. */
export function CustomerMenu({ name, optedOut, toggle, remove }: { name: string; optedOut: boolean; toggle: () => Promise<Result>; remove: () => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"toggle" | "remove" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (key: "toggle" | "remove", fn: () => Promise<Result>) =>
    start(async () => {
      setBusy(key);
      toastResult(await fn());
      setBusy(null);
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button variant="ghost" icon onClick={() => setOpen(true)} aria-label={`Actions for ${name}`}>
        <MoreHorizontal aria-hidden className="size-5" />
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-start" disabled={pending} loading={busy === "toggle"} onClick={() => run("toggle", toggle)}>
            {optedOut ? <UserCheck aria-hidden className="size-4" /> : <Ban aria-hidden className="size-4" />}
            {optedOut ? "Opt back in to campaigns" : "Opt out of campaigns"}
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            disabled={pending}
            loading={busy === "remove"}
            onClick={async () => (await confirmAction(`Delete ${name} and their message history?`)) && run("remove", remove)}
          >
            <Trash2 aria-hidden className="size-4" /> Delete customer
          </Button>
        </div>
      </Sheet>
    </>
  );
}
