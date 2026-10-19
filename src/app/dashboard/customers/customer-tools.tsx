"use client";

import { AlertCircle, Ban, Check, ChevronRight, Download, FileUp, MoreHorizontal, Pencil, QrCode, Trash2, UserCheck, UserPlus, UsersRound, X } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { safeAction, toastResult } from "@/components/toast";
import { Sheet } from "@/components/sheet";
import { Badge, Button, Field } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { cn } from "@/lib/cn";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { useLanguage } from "@/lib/i18n/context";
import type { CustomField } from "@/lib/custom-fields";
import { deleteCustomer, deletePendingCustomer, importCustomers, promotePendingCustomer, saveCustomer } from "../actions/customers";

/** Deletes a customer from their profile after a confirmation, then goes back to the customer list. */
export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      loading={pending}
      onClick={async () => {
        const ok = await confirmAction({
          title: `Delete ${name}?`,
          message: "They are removed with their chats and messages. This can't be undone. Customers with orders can't be deleted (their payments must stay on record): opt them out instead.",
          confirmLabel: "Delete customer",
          danger: true,
        });
        if (!ok) return;
        start(async () => {
          const r = await safeAction(() => deleteCustomer(id));
          toastResult(r);
          if (r.ok) router.push("/dashboard/customers");
        });
      }}
    >
      <Trash2 aria-hidden className="size-4" /> Delete customer
    </Button>
  );
}

const LINKS = [
  { href: "/dashboard/customers/grow", label: "Get more customers", icon: QrCode, manager: false },
  { href: "/dashboard/customers/audiences", label: "Audiences", icon: UsersRound, manager: true },
  // Google Sheet sync and Custom fields are account setup: Settings › Data and connections.
];

/**
 * The customers page's actions: Export, Import and Add up front (phones keep only Add), and the
 * page links (Get more customers, Google Sheet, Audiences) in the "⋯" sheet. In the admin's "All clients" view
 * only the export is offered; everything else needs a client picked.
 */
export function CustomerActions({
  canManage,
  hasClient = true,
  exportHref = null,
  exportCount = 0,
  regions,
  fields = [],
}: {
  canManage: boolean;
  hasClient?: boolean;
  /** The client's custom customer fields, for the Add form. */
  fields?: CustomField[];
  /** The client's delivery regions, home city first. */
  regions: string[];
  /** CSV download of the customers currently listed (managers and admins only). */
  exportHref?: string | null;
  exportCount?: number;
}) {
  const [open, setOpen] = useState<"add" | "import" | "more" | null>(null);
  const ta = useLanguage().lang === "ta";
  const links = hasClient ? LINKS.filter((l) => canManage || !l.manager) : [];
  const manage = canManage && hasClient;
  const exportLabel = `Export ${exportCount.toLocaleString("en-IN")} customer${exportCount === 1 ? "" : "s"} as CSV`;
  return (
    <>
      {exportHref && (
        <a href={exportHref} download className={cn(buttonClass("secondary"), "max-sm:hidden")} title={exportLabel}>
          <Download aria-hidden className="size-4" /> {ta ? "CSV ஏற்றுமதி" : "Export CSV"}
        </a>
      )}
      {manage && (
        <>
          <Button variant="secondary" className="max-sm:hidden" onClick={() => setOpen("import")}>
            <FileUp aria-hidden className="size-4" /> {ta ? "CSV இறக்குமதி" : "Import CSV"}
          </Button>
          <Button onClick={() => setOpen("add")} className="max-sm:px-3.5">
            <UserPlus aria-hidden className="size-4" />{" "}
            {ta ? (
              <span>சேர்<span className="max-sm:sr-only"> வாடிக்கையாளர்</span></span>
            ) : (
              <span>Add<span className="max-sm:sr-only"> customer</span></span>
            )}
          </Button>
        </>
      )}
      {(links.length > 0 || manage || exportHref) && (
        <Button variant="secondary" icon aria-label="More customer tools" onClick={() => setOpen("more")}>
          <MoreHorizontal aria-hidden className="size-5" />
        </Button>
      )}

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
          {exportHref && (
            <li>
              <a href={exportHref} download onClick={() => setOpen(null)} className="flex min-h-12 items-center gap-3 rounded-control px-3 text-md font-medium text-ink transition active:bg-sunken">
                <Download aria-hidden className="size-5 text-brand-deep" />
                <span className="flex-1">
                  Export CSV
                  <span className="block text-xs font-normal text-muted">{exportLabel}</span>
                </span>
              </a>
            </li>
          )}
          {manage && (
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
        {open === "add" ? <CustomerForm id={null} regions={regions} fields={fields} done={() => setOpen(null)} /> : <ImportForm done={() => setOpen(null)} />}
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

export type EditableCustomer = {
  id: string;
  name: string;
  phone: string;
  tags: string;
  location: string;
  locationRaw: string;
  region: string;
  purchases: string;
  /** Custom field values by key. */
  extra?: Record<string, string>;
};

function CustomerForm({
  id,
  initial,
  regions,
  fields = [],
  done,
}: {
  id: string | null;
  initial?: Omit<EditableCustomer, "id">;
  /** The client's regions, home city first ("Madurai city", "Outside Madurai", "Not sure"). */
  regions: string[];
  /** The client's custom customer fields. */
  fields?: CustomField[];
  done: () => void;
}) {
  const [v, setV] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    tags: initial?.tags ?? "",
    location: initial?.location ?? "",
    locationRaw: initial?.locationRaw ?? "",
    region: initial?.region || regions[0],
    purchases: initial?.purchases ?? "",
    optInSource: CONSENT[0],
    extra: initial?.extra ?? {},
  });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await safeAction(() => saveCustomer(id, v));
          toastResult(r);
          if (r.ok) {
            done();
            router.refresh();
          }
        });
      }}
    >
      <Field id="n" label="Name" required>
        <input autoComplete="name" autoCapitalize="words" className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field id="p" label="WhatsApp number" hint="10-digit numbers get +91" required>
        <input type="tel" inputMode="tel" autoComplete="tel" className="field" placeholder="+91 98765 43210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </Field>
      {/* Side-by-side fields keep their boxes on one line: short labels, hints in the placeholder, bottoms aligned. */}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <Field id="loc" label="Area / locality">
          <input className="field" placeholder="e.g. Anna Nagar" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </Field>
        <Field id="reg" label="Delivery region">
          <select className="field" value={v.region} onChange={(e) => setV({ ...v, region: e.target.value })}>
            {(initial?.region && !regions.includes(initial.region) ? [...regions, initial.region] : regions).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="loc-raw" label="Full street address / notes" hint="optional">
        <input className="field" placeholder="Door no, street, landmark…" value={v.locationRaw} onChange={(e) => setV({ ...v, locationRaw: e.target.value })} />
      </Field>
      <Field id="purch" label="What they bought" hint="optional">
        <input className="field" placeholder="Products they usually buy" value={v.purchases} onChange={(e) => setV({ ...v, purchases: e.target.value })} />
      </Field>
      <CustomFieldInputs fields={fields} values={v.extra} onChange={(extra) => setV({ ...v, extra })} idPrefix={id ? `cf-${id}` : "cf-new"} />
      <Field id="t" label="Tags" hint="comma separated, optional">
        <input className="field" placeholder="vip, wholesale" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} />
      </Field>
      {!id && (
        <>
          <ConsentField id="consent-add" value={v.optInSource} onChange={(optInSource) => setV({ ...v, optInSource })} />
          <ConsentOptions id="consent-add" />
        </>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        {id ? "Save changes" : "Add customer"}
      </Button>
    </form>
  );
}

/** Button + sheet to edit an existing customer's profile, address, region, purchases and tags. */
export function EditCustomerButton({ customer, regions, fields = [] }: { customer: EditableCustomer; regions: string[]; fields?: CustomField[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil aria-hidden className="size-3.5" /> Edit details
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Edit ${customer.name}`}>
        <CustomerForm id={customer.id} initial={customer} regions={regions} fields={fields} done={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export type PendingCustomerRow = {
  id: string;
  name: string | null;
  rawPhone: string | null;
  location: string | null;
  payment: string | null;
  items: string | null;
  notes: string | null;
  page: string | null;
};

/** Banner + Sheet on `/dashboard/customers` for reviewing `PendingCustomer` records transcribed without a clear phone number. */
export function PendingCustomersBanner({ rows }: { rows: PendingCustomerRow[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
        <div className="flex items-start gap-2.5">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-ink">
              {rows.length} customer{rows.length === 1 ? "" : "s"} from order sheets need a phone number
            </p>
            <p className="text-xs text-muted">
              These entries had missing, partial, or dual phone numbers when imported. Add a mobile number to move them into your active directory.
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Review {rows.length} pending
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Pending customers (${rows.length})`}>
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Enter a 10-digit mobile number for any customer below to move them into your WhatsApp directory, or dismiss entries that can&apos;t be recovered.
          </p>
          <ul className="space-y-3">
            {rows.map((r) => (
              <PendingRowItem key={r.id} row={r} />
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}

function PendingRowItem({ row }: { row: PendingCustomerRow }) {
  const router = useRouter();
  const firstTenDigits = row.rawPhone?.match(/\d{10}/)?.[0] ?? row.rawPhone?.replace(/[^\d+]/g, "") ?? "";
  const [name, setName] = useState(!row.name || row.name === "(name unclear)" ? "" : row.name);
  const [phone, setPhone] = useState(firstTenDigits);
  const [location, setLocation] = useState(row.location ?? "");
  const [busy, start] = useTransition();

  return (
    <li className="ui-card space-y-2.5 rounded-card border border-line bg-panel p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-semibold text-ink">{row.name || "(name unclear)"}</span>
        <div className="flex flex-wrap gap-1">
          {row.rawPhone && <Badge tone="amber">Raw: {row.rawPhone}</Badge>}
          {row.page && <Badge tone="gray">Page {row.page}</Badge>}
        </div>
      </div>
      {(row.items || row.notes) && (
        <p className="text-muted">
          {row.items && <span>Bought: {row.items}</span>}
          {row.items && row.notes && " · "}
          {row.notes && <span>Note: {row.notes}</span>}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          className="field py-1.5 text-xs"
          placeholder="Customer name"
          aria-label="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field font-mono py-1.5 text-xs"
          type="tel"
          inputMode="tel"
          placeholder="10-digit phone"
          aria-label="WhatsApp phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          className="field py-1.5 text-xs"
          placeholder="Area (optional)"
          aria-label="Customer area"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const res = await safeAction(() => deletePendingCustomer(row.id));
              toastResult(res);
              if (res.ok) router.refresh();
            })
          }
        >
          <X aria-hidden className="size-3.5" /> Dismiss
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !phone.trim() || !name.trim()}
          loading={busy}
          onClick={() =>
            start(async () => {
              const res = await promotePendingCustomer(row.id, {
                name,
                phone,
                location,
                purchases: row.items ?? undefined,
              });
              toastResult(res);
              if (res.ok) router.refresh();
            })
          }
        >
          <Check aria-hidden className="size-3.5" /> Add to directory
        </Button>
      </div>
    </li>
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
          const r = await safeAction(async () => importCustomers(await file.text(), tags, consent));
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
