"use client";

import { KeyRound, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Button, Label } from "@/components/ui";
import { createClient, createClientUser, resetUserPassword, saveClientWhatsApp } from "../actions/clients";

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
