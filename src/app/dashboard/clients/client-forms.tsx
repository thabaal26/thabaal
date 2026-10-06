"use client";

import { KeyRound, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { HEX, themeStyle } from "@/lib/theme";
import { createClient, createClientUser, resetUserPassword, saveClientBranding, saveClientWhatsApp, type BrandingInput } from "../actions/clients";

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

export function WhatsAppForm({ clientId, phoneNumberId, businessAccountId, hasToken }: { clientId: string; phoneNumberId: string; businessAccountId: string; hasToken: boolean }) {
  const [v, setV] = useState({ token: "", phoneNumberId, businessAccountId });
  const { pending, submit } = useSubmit();
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-deep hover:underline">Edit WhatsApp details</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => saveClientWhatsApp(clientId, v), () => setV((x) => ({ ...x, token: "" })));
        }}
      >
        <div>
          <Label htmlFor={`t-${clientId}`} hint={hasToken ? "saved; leave blank to keep" : "permanent System User token"}>Access token</Label>
          <input id={`t-${clientId}`} type="password" autoComplete="off" className="field font-mono" value={v.token} onChange={(e) => setV({ ...v, token: e.target.value })} placeholder={hasToken ? "••••••••" : "EAAG…"} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`pn-${clientId}`}>Phone number ID</Label>
            <input id={`pn-${clientId}`} inputMode="numeric" className="field font-mono" value={v.phoneNumberId} onChange={(e) => setV({ ...v, phoneNumberId: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={`w-${clientId}`}>Business Account ID</Label>
            <input id={`w-${clientId}`} inputMode="numeric" className="field font-mono" value={v.businessAccountId} onChange={(e) => setV({ ...v, businessAccountId: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted">Find these in Meta WhatsApp Manager → API setup. Add this portal&apos;s webhook URL (Settings) to the client&apos;s Meta app too.</p>
        <Button disabled={pending} size="sm">{pending ? spin : "Save WhatsApp details"}</Button>
      </form>
    </details>
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
              <p className="truncate text-[10px] text-white/55">{v.tagline || "WhatsApp campaigns"}</p>
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
