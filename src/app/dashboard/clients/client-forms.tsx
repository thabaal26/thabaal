"use client";

import { KeyRound, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { HEX, themeStyle } from "@/lib/theme";
import { cn } from "@/lib/cn";
import {
  addClientNumber,
  createClient,
  createClientUser,
  findAccountNumbers,
  refreshClientNumbers,
  setDailyCap,
  removeClientNumber,
  renameNumber,
  resetUserPassword,
  saveClientBranding,
  saveClientToken,
  saveSendingRules,
  setDefaultNumber,
  type BrandingInput,
  type FoundNumber,
} from "../actions/clients";

type Result = { ok: boolean; message?: string; errors?: string[] };

/** Runs an action with a spinner, shows the result and refreshes the page on success. */
function useSubmit() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      toastResult(r);
      if (r.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { pending, submit };
}

const spin = <Loader2 className="size-4 animate-spin" />;

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { pending, submit } = useSubmit();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New client
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New client">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => createClient(name), () => { setName(""); setOpen(false); });
          }}
        >
          <div>
            <Label htmlFor="client-name">Business name</Label>
            <input id="client-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thenan Oils" required autoFocus />
          </div>
          <p className="text-xs text-muted">Next, add their login and WhatsApp details on this page, then pick them in the sidebar to import customers.</p>
          <Button disabled={pending} className="w-full sm:w-auto">{pending ? spin : "Add client"}</Button>
        </form>
      </Sheet>
    </>
  );
}

export function AddLoginForm({ clientId }: { clientId: string }) {
  const [v, setV] = useState({ name: "", email: "", password: "" });
  const { pending, submit } = useSubmit();
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-deep hover:underline">+ Add login</summary>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => createClientUser(clientId, v), () => setV({ name: "", email: "", password: "" }));
        }}
      >
        <div>
          <Label htmlFor={`n-${clientId}`}>Name</Label>
          <input id={`n-${clientId}`} className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor={`e-${clientId}`}>Email</Label>
          <input id={`e-${clientId}`} type="email" autoComplete="off" className="field" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`p-${clientId}`} hint="8+ characters, share it with them privately">Password</Label>
          <input id={`p-${clientId}`} type="text" autoComplete="new-password" minLength={8} className="field font-mono" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required />
        </div>
        <div className="sm:col-span-2">
          <Button disabled={pending} size="sm">{pending ? spin : "Create login"}</Button>
        </div>
      </form>
    </details>
  );
}

export function ResetPasswordButton({ userId, email }: { userId: string; email: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Set a new password"
      onClick={() => {
        const pw = window.prompt(`New password for ${email} (8+ characters):`);
        if (pw) submit(() => resetUserPassword(userId, pw));
      }}
    >
      {pending ? spin : <><KeyRound className="size-3.5" /> Reset</>}
    </Button>
  );
}

const noFill = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true" } as const;

/** The access token the client's numbers share. Never shown back; blank keeps the saved one. */
export function TokenForm({ clientId, hasToken }: { clientId: string; hasToken: boolean }) {
  const [token, setToken] = useState("");
  const { pending, submit } = useSubmit();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveClientToken(clientId, token), () => setToken(""));
      }}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor={`tok-${clientId}`} hint={hasToken ? "saved · paste a new one to replace it" : "permanent System User token"}>Access token</Label>
        <input id={`tok-${clientId}`} name="wa-token" type="password" {...noFill} autoComplete="new-password" className="field font-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasToken ? "••••••••" : "EAA…"} />
      </div>
      <Button disabled={pending || !token.trim()} size="sm" variant="secondary">{pending ? spin : hasToken ? "Replace token" : "Save token"}</Button>
    </form>
  );
}

/** Finds a WhatsApp account's numbers on Meta, then adds the one picked. */
export function AddNumberForm({ clientId, hasToken }: { clientId: string; hasToken: boolean }) {
  const [waba, setWaba] = useState("");
  const [ownToken, setOwnToken] = useState("");
  const [found, setFound] = useState<FoundNumber[] | null>(null);
  const [pick, setPick] = useState("");
  const [label, setLabel] = useState("");
  const [finding, startFind] = useTransition();
  const { pending, submit } = useSubmit();

  const find = () =>
    startFind(async () => {
      const r = await findAccountNumbers(clientId, waba, ownToken);
      if (!r.ok) return toastResult(r);
      setFound(r.numbers ?? []);
      const first = r.numbers?.find((n) => !n.addedTo);
      setPick(first?.phoneNumberId ?? "");
      if (first && !label) setLabel(first.verifiedName === "Test Number" ? "Test number" : "Main");
    });

  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-deep hover:underline">+ Add a WhatsApp number</summary>
      <div className="mt-3 space-y-3 rounded-xl border border-line p-3">
        <div>
          <Label htmlFor={`waba-${clientId}`} hint="WhatsApp Manager → API setup">WhatsApp Business Account ID</Label>
          <div className="flex gap-2">
            <input
              id={`waba-${clientId}`}
              name="wa-business-account-id"
              {...noFill}
              inputMode="numeric"
              className="field font-mono"
              value={waba}
              onChange={(e) => { setWaba(e.target.value.replace(/\D/g, "")); setFound(null); }}
              placeholder="1124232406755071"
            />
            <Button type="button" variant="secondary" disabled={finding || waba.length < 6} onClick={find}>{finding ? spin : "Find numbers"}</Button>
          </div>
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">This account needs a different token?</summary>
          <input name="wa-number-token" type="password" {...noFill} autoComplete="new-password" className="field mt-2 font-mono" value={ownToken} onChange={(e) => setOwnToken(e.target.value)} placeholder="EAA… (leave blank to use the client's token)" />
        </details>
        {!hasToken && !ownToken && <p className="text-xs text-amber-700">Save the client&apos;s access token above first, or paste one for this account.</p>}

        {found && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(() => addClientNumber(clientId, { businessAccountId: waba, phoneNumberId: pick, label, token: ownToken }), () => {
                setFound(null); setWaba(""); setOwnToken(""); setLabel(""); setPick("");
              });
            }}
          >
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-ink-2">Numbers in this account</legend>
              {found.map((n) => (
                <label key={n.phoneNumberId} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm", pick === n.phoneNumberId ? "border-brand bg-brand-soft/50" : "border-line", n.addedTo && "cursor-not-allowed opacity-60")}>
                  <input type="radio" name={`pick-${clientId}`} className="accent-brand" checked={pick === n.phoneNumberId} disabled={!!n.addedTo} onChange={() => setPick(n.phoneNumberId)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{n.displayPhone} <span className="font-normal text-muted">· {n.verifiedName}</span></span>
                    <span className="block font-mono text-[11px] text-muted">ID {n.phoneNumberId}{n.addedTo ? ` · already added to ${n.addedTo}` : ""}</span>
                  </span>
                  {n.quality && <span className="text-[11px] text-muted">{n.quality.toLowerCase()}</span>}
                </label>
              ))}
            </fieldset>
            <div>
              <Label htmlFor={`label-${clientId}`} hint="shown when picking who sends">Name for this number</Label>
              <input id={`label-${clientId}`} {...noFill} className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main, Madurai, Test…" />
            </div>
            <Button disabled={pending || !pick || !label.trim()} size="sm">{pending ? spin : "Add number"}</Button>
          </form>
        )}
      </div>
    </details>
  );
}

export function RefreshNumbersButton({ clientId }: { clientId: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit(() => refreshClientNumbers(clientId))} title="Fetch quality and limits from Meta">
      {pending ? spin : "Refresh from Meta"}
    </Button>
  );
}

export function NumberActions({ id, label, isDefault, dailyCap }: { id: string; label: string; isDefault: boolean; dailyCap: number | null }) {
  const { pending, submit } = useSubmit();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        title="Message fewer people a day than Meta allows while a new number builds quality"
        onClick={() => {
          const next = window.prompt(`Warm-up cap for ${label}: most people to message per day.
Leave empty to follow Meta's limit.`, dailyCap?.toString() ?? "");
          if (next !== null) submit(() => setDailyCap(id, next));
        }}
      >
        {dailyCap != null ? `Cap ${dailyCap}/day` : "Set cap"}
      </Button>
      {!isDefault && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit(() => setDefaultNumber(id))}>Make default</Button>}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          const next = window.prompt("Name for this number:", label);
          if (next && next !== label) submit(() => renameNumber(id, next));
        }}
      >
        Rename
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${label}? Campaigns that send from it will use the default number instead.`)) submit(() => removeClientNumber(id));
        }}
      >
        Remove
      </Button>
    </div>
  );
}

const BRAND_FIELDS: { key: keyof BrandingInput; label: string; hint?: string; placeholder: string }[] = [
  { key: "logoUrl", label: "Logo", hint: "square image", placeholder: "/brands/acme/mark.png or https://…" },
  { key: "bannerUrl", label: "Welcome banner", hint: "wide, about 1200×628", placeholder: "/brands/acme/banner.jpg or https://…" },
  { key: "tagline", label: "Tagline", hint: "under the name", placeholder: "Cold pressed oils since 2018" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
  { key: "supportPhone", label: "Contact number", placeholder: "+91 89253 90439" },
];

export function BrandingForm({ clientId, name, initial }: { clientId: string; name: string; initial: BrandingInput }) {
  const [v, setV] = useState(initial);
  const { pending, submit } = useSubmit();
  const preview = themeStyle({ brandPrimary: HEX.test(v.brandPrimary) ? v.brandPrimary : null, brandAccent: HEX.test(v.brandAccent) ? v.brandAccent : null });
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-deep hover:underline">Edit branding</summary>
      <form
        className="mt-3 grid gap-4 lg:grid-cols-[1fr_15rem]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveClientBranding(clientId, v));
        }}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["brandPrimary", "brandAccent"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`${k}-${clientId}`} hint={k === "brandPrimary" ? "buttons, charts" : "highlights"}>{k === "brandPrimary" ? "Main colour" : "Accent colour"}</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={`${k === "brandPrimary" ? "Main" : "Accent"} colour picker`}
                    value={HEX.test(v[k]) ? v[k] : "#0f9d58"}
                    onChange={(e) => setV({ ...v, [k]: e.target.value })}
                    className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1 sm:h-10"
                  />
                  <input id={`${k}-${clientId}`} className="field font-mono" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="#f5c400" />
                </div>
              </div>
            ))}
          </div>
          {BRAND_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`${f.key}-${clientId}`} hint={f.hint}>{f.label}</Label>
              <input id={`${f.key}-${clientId}`} className="field" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} placeholder={f.placeholder} />
            </div>
          ))}
          <Button disabled={pending} size="sm">{pending ? spin : "Save branding"}</Button>
        </div>

        {/* Live preview with the same theme maths the portal uses, so contrast fixes show here too. */}
        <div style={preview} className="h-fit overflow-hidden rounded-2xl border border-line bg-canvas text-xs shadow-card">
          <div className="flex items-center gap-2 bg-night p-3">
            {v.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of an admin-supplied image
              <img src={v.logoUrl} alt="" className="size-8 rounded-lg object-cover" />
            ) : (
              <span className="size-8 rounded-lg bg-brand" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{name}</p>
              <p className="truncate text-[11px] text-white/55">{v.tagline || "WhatsApp campaigns"}</p>
            </div>
          </div>
          <div className="space-y-1 bg-night px-3 pb-3">
            <p className="rounded-md bg-white/10 px-2 py-1 font-medium text-white"><span className="text-glow">●</span> Overview</p>
            <p className="px-2 py-1 text-white/60">Campaigns</p>
          </div>
          <div className="space-y-2 p-3">
            <span className="inline-flex rounded-lg bg-brand px-3 py-1.5 font-medium text-white">Button</span>
            <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full w-2/3 rounded-full bg-brand" /></div>
            <span className="inline-flex rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-deep">coconut-oil</span>
          </div>
        </div>
      </form>
    </details>
  );
}

const GAPS = [
  { h: 0, label: "Off: no limit" },
  { h: 24, label: "1 day" },
  { h: 48, label: "2 days" },
  { h: 72, label: "3 days (recommended)" },
  { h: 168, label: "1 week" },
];

/** How often one customer may get offers, and the night hours when marketing waits. */
export function SendingRulesForm({ clientId, initial }: { clientId: string; initial: { marketingGapHours: number; quietFrom: string | null; quietTo: string | null } }) {
  const [gap, setGap] = useState(initial.marketingGapHours);
  const [quietOn, setQuietOn] = useState(Boolean(initial.quietFrom && initial.quietTo));
  const [from, setFrom] = useState(initial.quietFrom ?? "21:00");
  const [to, setTo] = useState(initial.quietTo ?? "09:00");
  const { pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveSendingRules(clientId, { marketingGapHours: gap, quietFrom: quietOn ? from : "", quietTo: quietOn ? to : "" }));
      }}
    >
      <div>
        <Label htmlFor={`gap-${clientId}`} hint="marketing only">Gap between offers per customer</Label>
        <select id={`gap-${clientId}`} className="field" value={gap} onChange={(e) => setGap(Number(e.target.value))}>
          {GAPS.map((g) => <option key={g.h} value={g.h}>{g.label}</option>)}
          {!GAPS.some((g) => g.h === gap) && <option value={gap}>{gap} hours</option>}
        </select>
      </div>
      <div>
        <Label htmlFor={`qf-${clientId}`} hint="India time · marketing waits">
          <span className="inline-flex items-center gap-2">
            <input type="checkbox" className="size-5 accent-brand sm:size-4" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} aria-label="Use quiet hours" />
            Quiet hours
          </span>
        </Label>
        <div className="flex items-center gap-2">
          <input id={`qf-${clientId}`} type="time" className="field" value={from} disabled={!quietOn} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-muted">to</span>
          <input type="time" aria-label="Quiet hours end" className="field" value={to} disabled={!quietOn} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Button disabled={pending} size="sm">{pending ? spin : "Save rules"}</Button>
    </form>
  );
}
