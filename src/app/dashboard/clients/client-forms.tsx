"use client";

import { KeyRound, Plus } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Picker } from "@/components/picker";
import { confirmAction, promptText } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, CheckRow, Field, Label } from "@/components/ui";
import {
  CLIENT_PLAN_PRESETS,
  CLIENT_SECTIONS,
  detectPlanPreset,
  sanitizeDisabledSections,
  type ClientSectionId,
} from "@/lib/client-sections";
import { HEX, themeStyle } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { BUSINESS_TYPES } from "@/lib/business-types";
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
  setUserAccess,
  saveClientBranding,
  saveClientSections,
  saveClientToken,
  saveSendingRules,
  setDefaultNumber,
  type BrandingInput,
  type FoundNumber,
} from "../actions/clients";

type Result = { ok: boolean; message?: string; errors?: string[] };

/** The colour pickers start here when no brand colour is set: the portal's default brand green. */
const DEFAULT_BRAND = "#0d844a";

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

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [typeId, setTypeId] = useState<string>("");
  const [presetId, setPresetId] = useState<string>("full");
  const { pending, submit } = useSubmit();
  const selectedPreset = CLIENT_PLAN_PRESETS.find((p) => p.id === presetId) ?? CLIENT_PLAN_PRESETS[0];
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4 shrink-0" /> New client
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New client">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(
              () => createClient(name, selectedPreset.disabledSections, city, typeId),
              () => {
                setName("");
                setCity("");
                setTypeId("");
                setPresetId("full");
                setOpen(false);
              },
            );
          }}
        >
          <Field id="client-name" label="Business name" required help="Next, add their login and WhatsApp details on this page, then pick them in the sidebar to import customers.">
            <input className="field" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fresh Mart" />
          </Field>
          <Field id="client-city" label="Home city" required help="Where they deliver from. Customers are grouped as in this city, outside it, or not sure.">
            <input className="field" autoCapitalize="words" autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Chennai" />
          </Field>
          <Field id="client-type" label="Business type" help="Sets suggested sections below and starter custom fields; both can be changed later.">
            <select
              className="field"
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                const t = BUSINESS_TYPES.find((b) => b.id === e.target.value);
                if (t) setPresetId(t.preset);
              }}
            >
              <option value="">Choose…</option>
              {BUSINESS_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          {BUSINESS_TYPES.find((b) => b.id === typeId) && (
            <p className="-mt-2 text-xs text-muted">
              {BUSINESS_TYPES.find((b) => b.id === typeId)!.description}
              {BUSINESS_TYPES.find((b) => b.id === typeId)!.starterFields.length
                ? ` Starter fields: ${BUSINESS_TYPES.find((b) => b.id === typeId)!.starterFields.map((f) => f.label).join(", ")}.`
                : ""}
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-2">Portal plan & sections</legend>
            <p className="text-xs text-muted">Choose which sections this client needs. You can also toggle individual sections anytime after adding them.</p>
            <div className="space-y-2 pt-1">
              {CLIENT_PLAN_PRESETS.map((p) => {
                const active = presetId === p.id;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-card border p-3 text-sm transition",
                      active ? "border-brand bg-brand-soft/60 ring-1 ring-brand/30" : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="client-plan-preset"
                      className="check mt-0.5 rounded-full"
                      checked={active}
                      onChange={() => setPresetId(p.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        <span>{p.label}</span>
                        <Badge tone={active ? "green" : "gray"}>{p.badge}</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{p.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Button type="submit" loading={pending} className="w-full sm:w-auto">Add client</Button>
        </form>
      </Sheet>
    </>
  );
}

export function AddLoginForm({ clientId }: { clientId: string }) {
  const [v, setV] = useState({ name: "", email: "", password: "", access: "STAFF" as "MANAGER" | "STAFF" | "VIEWER" });
  const { pending, submit } = useSubmit();
  return (
    <details className="group mt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control text-sm font-medium text-brand-deep hover:underline sm:min-h-8 [&::-webkit-details-marker]:hidden">
        <Plus aria-hidden className="size-4 shrink-0" /> Add login
      </summary>
      <form
        className="mt-2 grid grid-cols-1 gap-4 rounded-card border border-line p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => createClientUser(clientId, v), () => setV({ name: "", email: "", password: "", access: "STAFF" }));
        }}
      >
        <Field id={`n-${clientId}`} label="Name" required>
          <input autoComplete="off" className="field" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field id={`e-${clientId}`} label="Email" required>
          <input type="email" inputMode="email" autoComplete="off" className="field" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field id={`p-${clientId}`} label="Password" hint="8+ characters, share it with them privately" required className="sm:col-span-2">
          <input type="text" autoComplete="new-password" minLength={8} className="field font-mono" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        </Field>
        <Field id={`a-${clientId}`} label="Access" className="sm:col-span-2">
          <select className="field" value={v.access} onChange={(e) => setV({ ...v, access: e.target.value as typeof v.access })}>
            {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending} size="sm" className="max-sm:w-full">Create login</Button>
        </div>
      </form>
    </details>
  );
}

const ACCESS_OPTIONS = [
  { value: "MANAGER", label: "Manager: campaigns, templates, customers, orders, replies" },
  { value: "STAFF", label: "Staff: orders, dispatch, replies, sheet" },
  { value: "VIEWER", label: "Viewer: look only" },
] as const;

/** Change what an existing client login may do. */
export function AccessSelect({ userId, access }: { userId: string; access: "MANAGER" | "STAFF" | "VIEWER" }) {
  const { pending, submit } = useSubmit();
  return (
    <select
      aria-label="Access"
      className="field w-auto py-0 sm:min-h-8 sm:text-xs sm:pointer-coarse:min-h-11"
      disabled={pending}
      defaultValue={access}
      onChange={(e) => submit(() => setUserAccess(userId, e.target.value as typeof access))}
    >
      <option value="MANAGER">Manager</option>
      <option value="STAFF">Staff</option>
      <option value="VIEWER">Viewer</option>
    </select>
  );
}

export function ResetPasswordButton({ userId, email }: { userId: string; email: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      title="Set a new password"
      aria-label={`Reset password for ${email}`}
      onClick={async () => {
        const pw = await promptText(`New password for ${email} (8+ characters):`, { label: "New password", type: "text" }, { title: "Reset password" });
        if (pw) submit(() => resetUserPassword(userId, pw));
      }}
    >
      <KeyRound aria-hidden className="size-4 shrink-0" /> Reset
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
      <Button type="submit" disabled={!token.trim()} loading={pending} size="sm" variant="secondary" className="sm:mb-px">{hasToken ? "Replace token" : "Save token"}</Button>
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
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control text-sm font-medium text-brand-deep hover:underline sm:min-h-8 [&::-webkit-details-marker]:hidden">
        <Plus aria-hidden className="size-4 shrink-0" /> Add a WhatsApp number
      </summary>
      <div className="mt-2 space-y-3 rounded-card border border-line p-3">
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
            <Button type="button" variant="secondary" className="shrink-0" disabled={waba.length < 6} loading={finding} onClick={find}>Find numbers</Button>
          </div>
        </div>
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-muted hover:text-ink sm:min-h-8 sm:text-xs">This account needs a different token?</summary>
          <input name="wa-number-token" aria-label="Access token for this account" type="password" {...noFill} autoComplete="new-password" className="field mt-2 font-mono" value={ownToken} onChange={(e) => setOwnToken(e.target.value)} placeholder="EAA… (leave blank to use the client's token)" />
        </details>
        {!hasToken && !ownToken && <p className="text-xs text-warning">Save the client&apos;s access token above first, or paste one for this account.</p>}

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
              <legend className="mb-1.5 text-sm font-medium text-ink-2">Numbers in this account</legend>
              {found.map((n) => (
                <label key={n.phoneNumberId} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm", pick === n.phoneNumberId ? "border-brand bg-brand-soft" : "border-line", n.addedTo && "cursor-not-allowed opacity-60")}>
                  <input type="radio" name={`pick-${clientId}`} className="check rounded-full" checked={pick === n.phoneNumberId} disabled={!!n.addedTo} onChange={() => setPick(n.phoneNumberId)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{n.displayPhone} <span className="font-normal text-muted">· {n.verifiedName}</span></span>
                    <span className="block font-mono text-2xs text-muted">ID {n.phoneNumberId}{n.addedTo ? ` · already added to ${n.addedTo}` : ""}</span>
                  </span>
                  {n.quality && <span className="text-2xs text-muted">{n.quality.toLowerCase()}</span>}
                </label>
              ))}
            </fieldset>
            <Field id={`label-${clientId}`} label="Name for this number" hint="shown when picking who sends">
              <input {...noFill} className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main, Madurai, Test…" />
            </Field>
            <Button type="submit" disabled={!pick || !label.trim()} loading={pending} size="sm" className="max-sm:w-full">Add number</Button>
          </form>
        )}
      </div>
    </details>
  );
}

export function RefreshNumbersButton({ clientId }: { clientId: string }) {
  const { pending, submit } = useSubmit();
  return (
    <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => submit(() => refreshClientNumbers(clientId))} title="Fetch quality and limits from Meta">
      Refresh from Meta
    </Button>
  );
}

export function NumberActions({ id, label, isDefault, dailyCap }: { id: string; label: string; isDefault: boolean; dailyCap: number | null }) {
  const { pending, submit } = useSubmit();
  return (
    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:shrink-0">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        title="Message fewer people a day than Meta allows while a new number builds quality"
        onClick={async () => {
          const next = await promptText(
            `Warm-up cap for ${label}: most people to message per day.
Leave empty to follow Meta's limit.`,
            { label: "People per day", defaultValue: dailyCap?.toString() ?? "", inputMode: "numeric" },
            { title: "Warm-up cap" },
          );
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
        onClick={async () => {
          const next = await promptText("Name for this number:", { label: "Name", defaultValue: label }, { title: "Rename number" });
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
        onClick={async () => {
          if (await confirmAction({ message: `Remove ${label}? Campaigns that send from it will use the default number instead.`, confirmLabel: "Remove number", danger: true })) submit(() => removeClientNumber(id));
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
  { key: "defaultImageUrl", label: "Message picture", hint: "JPG or PNG, about 1200×628; order updates and picture templates", placeholder: "/brands/acme/order.jpg or https://…" },
  { key: "tagline", label: "Tagline", hint: "under the name", placeholder: "Fresh groceries, delivered daily" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
  { key: "supportPhone", label: "Contact number", placeholder: "+91 98765 43210" },
  { key: "homeCity", label: "Home city", hint: "for delivery regions; blank means Madurai", placeholder: "e.g. Chennai" },
  { key: "orderPrefix", label: "Order number prefix", hint: "2 to 5 letters; orders show as FM-1001", placeholder: "e.g. FM" },
];

export function BrandingForm({ clientId, name, initial }: { clientId: string; name: string; initial: BrandingInput }) {
  const [v, setV] = useState(initial);
  const { pending, submit } = useSubmit();
  const preview = themeStyle({ brandPrimary: HEX.test(v.brandPrimary) ? v.brandPrimary : null, brandAccent: HEX.test(v.brandAccent) ? v.brandAccent : null });
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-control text-sm font-medium text-brand-deep hover:underline sm:min-h-8 [&::-webkit-details-marker]:hidden">Edit branding</summary>
      <form
        className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveClientBranding(clientId, v));
        }}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            {(["brandPrimary", "brandAccent"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`${k}-${clientId}`} hint={k === "brandPrimary" ? "used when no accent" : "sidebar highlights"}>{k === "brandPrimary" ? "Main colour" : "Accent colour"}</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={`${k === "brandPrimary" ? "Main" : "Accent"} colour picker`}
                    value={HEX.test(v[k]) ? v[k] : DEFAULT_BRAND}
                    onChange={(e) => setV({ ...v, [k]: e.target.value })}
                    className="h-11 w-12 shrink-0 cursor-pointer rounded-control border border-line-strong bg-panel p-1 sm:h-10"
                  />
                  <input id={`${k}-${clientId}`} className="field font-mono" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="#f5c400" />
                </div>
              </div>
            ))}
          </div>
          <Field id={`businessType-${clientId}`} label="Business type" hint="label only; sections and fields stay as they are">
            <select id={`businessType-${clientId}`} className="field" value={v.businessType} onChange={(e) => setV({ ...v, businessType: e.target.value })}>
              <option value="">Not set</option>
              {BUSINESS_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          {BRAND_FIELDS.map((f) => (
            <Field key={f.key} id={`${f.key}-${clientId}`} label={f.label} hint={f.hint}>
              <input
                className="field"
                type={f.key === "supportPhone" ? "tel" : "text"}
                inputMode={f.key === "supportPhone" ? "tel" : f.key === "website" || f.key === "logoUrl" || f.key === "bannerUrl" || f.key === "defaultImageUrl" ? "url" : undefined}
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </Field>
          ))}
          <Button type="submit" loading={pending} size="sm" className="max-sm:w-full">Save branding</Button>
        </div>

        {/* Live preview with the same theme maths the portal uses, so contrast fixes show here too. */}
        <div style={preview} aria-label="Preview of their portal colours" role="img" className="h-fit overflow-hidden rounded-card border border-line bg-canvas text-xs shadow-card">
          <div className="flex items-center gap-2 bg-night p-3">
            {v.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of an admin-supplied image
              <img src={v.logoUrl} alt="" className="size-8 rounded-control object-cover" />
            ) : (
              <span className="size-8 rounded-control bg-gold" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{name}</p>
              <p className="truncate text-2xs text-white/70">{v.tagline || "WhatsApp campaigns"}</p>
            </div>
          </div>
          <div className="space-y-1 bg-night px-3 pb-3">
            <p className="relative rounded-control bg-night-2 px-2.5 py-1.5 font-medium text-white">
              <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-glow" />
              Dashboard
            </p>
            <p className="px-2.5 py-1.5 text-white/70">Campaigns</p>
          </div>
          <div className="space-y-2 p-3">
            <span className="inline-flex rounded-control bg-brand px-3 py-1.5 font-medium text-on-brand">Button</span>
            <p className="text-2xs text-muted">Pages, text and buttons keep the portal&apos;s neutral look; the brand colour marks the highlights.</p>
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
      className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveSendingRules(clientId, { marketingGapHours: gap, quietFrom: quietOn ? from : "", quietTo: quietOn ? to : "" }));
      }}
    >
      <div>
        <Label htmlFor={`gap-${clientId}`} hint="marketing only">Gap between offers per customer</Label>
        <Picker
          id={`gap-${clientId}`}
          title="Gap between offers per customer"
          value={String(gap)}
          onChange={(v) => setGap(Number(v))}
          options={[...GAPS.map((g) => ({ value: String(g.h), label: g.label })), ...(GAPS.some((g) => g.h === gap) ? [] : [{ value: String(gap), label: `${gap} hours` }])]}
        />
      </div>
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2">
          <CheckRow label="Quiet hours" className="min-h-0 py-0" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} />
          <span className="text-xs text-muted">India time · marketing waits</span>
        </div>
        <div className="flex items-center gap-2">
          <input id={`qf-${clientId}`} type="time" aria-label="Quiet hours start" className="field min-w-0 flex-1" value={from} disabled={!quietOn} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-muted">to</span>
          <input type="time" aria-label="Quiet hours end" className="field min-w-0 flex-1" value={to} disabled={!quietOn} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Button type="submit" loading={pending} size="sm" className="max-sm:w-full md:mb-px">Save rules</Button>
    </form>
  );
}

/**
 * Portal owner control to enable or disable individual sections (or apply a 1-click plan preset)
 * for a client, e.g. hiding Orders & Catalogue for clients who only send templates/campaigns.
 */
export function ClientSectionsForm({
  clientId,
  initialDisabled,
}: {
  clientId: string;
  initialDisabled: readonly string[];
}) {
  const [disabled, setDisabled] = useState<ClientSectionId[]>(() => sanitizeDisabledSections(initialDisabled));
  const { pending, submit } = useSubmit();

  const activePreset = detectPlanPreset(disabled);
  const enabledCount = CLIENT_SECTIONS.length - disabled.length;

  const toggleSection = (id: ClientSectionId, enabled: boolean) => {
    setDisabled((prev) => {
      if (enabled) return prev.filter((x) => x !== id);
      return prev.includes(id) ? prev : [...prev, id];
    });
  };

  const applyPreset = (presetDisabled: readonly ClientSectionId[]) => {
    setDisabled([...presetDisabled]);
  };

  const groups = ["Daily work", "Marketing"] as const;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveClientSections(clientId, disabled));
      }}
    >
      {/* 1-Click Plan Presets */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CLIENT_PLAN_PRESETS.map((preset) => {
          const isCurrent = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.disabledSections)}
              className={cn(
                "flex flex-col items-start justify-between gap-1.5 rounded-card border p-3 text-left transition active:scale-[0.99]",
                isCurrent
                  ? "border-brand bg-brand-soft/60 ring-1 ring-brand/30"
                  : "border-line bg-panel hover:border-line-strong hover:bg-subtle",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">{preset.label}</span>
                <Badge tone={isCurrent ? "green" : "gray"}>{preset.badge}</Badge>
              </div>
              <p className="text-2xs leading-relaxed text-muted">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* Individual Section Toggles */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <div key={group} className="rounded-card border border-line bg-sunken/35 p-3">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">{group} sections</p>
            <div className="space-y-2">
              {CLIENT_SECTIONS.filter((s) => s.group === group).map((sec) => {
                const enabled = !disabled.includes(sec.id);
                return (
                  <label
                    key={sec.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 transition",
                      enabled
                        ? "border-line bg-panel text-ink"
                        : "border-dashed border-line bg-canvas/60 text-muted opacity-75",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="check mt-0.5"
                      checked={enabled}
                      onChange={(e) => toggleSection(sec.id, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{sec.label}</span>
                        <span className={cn("text-2xs font-semibold", enabled ? "text-success" : "text-muted")}>
                          {enabled ? "Enabled" : "Hidden"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{sec.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink">{enabledCount}</span> of {CLIENT_SECTIONS.length} sections enabled · Dashboard &amp; Settings stay on automatically.
        </p>
        <Button type="submit" loading={pending} size="sm" className="max-sm:w-full">
          Save sections
        </Button>
      </div>
    </form>
  );
}

