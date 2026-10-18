"use client";

import { CheckCircle2, Cloud, LogOut, QrCode, RefreshCw, Smartphone, TriangleAlert } from "@/components/icons";
import { Phone3D, Send3D } from "@/components/icons-3d";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { safeAction, toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Field, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  connectSession,
  disconnectSession,
  getSessionState,
  saveWahaSettings,
  setProvider,
  type SessionState,
} from "../actions/provider";

type Provider = "META" | "LOCAL";

const OPTIONS = [
  {
    value: "META" as const,
    icon: Cloud,
    title: "Meta Cloud API",
    points: ["Official and safest for promotions", "Templates need Meta approval", "Meta charges per message"],
  },
  {
    value: "LOCAL" as const,
    icon: Smartphone,
    title: "Local session (WAHA)",
    points: ["Link a phone by scanning a QR code", "No template approval, no Meta fees", "Unofficial: the number can be banned"],
  },
];

export function ProviderSwitch({ provider, metaLive, localReady }: { provider: Provider; metaLive: boolean; localReady: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="card-3d">
      <CardHeader tone="brand" icon={<Send3D />} title="Sending provider" description="Choose how campaigns and test messages are sent. You can switch at any time; the next batch uses the new provider." />
      <div role="radiogroup" aria-label="Sending provider" className="grid gap-3 p-4 sm:p-5 md:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = provider === o.value;
          const configured = o.value === "META" ? metaLive : localReady;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending || active}
              onClick={async () => {
                const warn =
                  o.value === "LOCAL"
                    ? "Switch to the local session? Sending promotions from a QR-linked number breaks WhatsApp's terms and can get the number banned. Keep batches small and slow."
                    : "Switch to Meta Cloud API? Only Meta-approved templates will be sent.";
                if (!(await confirmAction({ message: warn, confirmLabel: "Switch", danger: o.value === "LOCAL" }))) return;
                start(async () => {
                  toastResult(await safeAction(() => setProvider(o.value)));
                  router.refresh();
                });
              }}
              className={cn(
                "relative rounded-card border p-4 text-left transition active:scale-[0.99] disabled:cursor-default disabled:active:scale-100",
                active ? "border-brand bg-brand-soft" : "border-line-strong/50 bg-panel hover:border-line-strong",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <span aria-hidden className={cn("grid size-8 place-items-center rounded-control", active ? "bg-brand text-on-brand" : "bg-sunken text-ink-2")}>
                    <o.icon className="size-4 shrink-0" />
                  </span>
                  {o.title}
                </span>
                {active ? <Badge tone="green" dot>Active</Badge> : pending ? <Spinner className="text-muted" /> : <span className="text-xs font-medium text-brand-deep">Switch</span>}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-ink-2">
                {o.points.map((p) => <li key={p}>• {p}</li>)}
              </ul>
              {!configured && <p className="mt-3 text-xs text-warning">Not set up yet, so sends are simulated (demo mode).</p>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

const STATUS_TEXT: Record<SessionState["status"], { tone: "green" | "amber" | "red" | "gray" | "blue"; label: string }> = {
  WORKING: { tone: "green", label: "Connected" },
  SCAN_QR_CODE: { tone: "amber", label: "Waiting for QR scan" },
  STARTING: { tone: "blue", label: "Starting…" },
  STOPPED: { tone: "gray", label: "Stopped" },
  FAILED: { tone: "red", label: "Failed" },
  MISSING: { tone: "gray", label: "Not started" },
  UNREACHABLE: { tone: "red", label: "Can't connect" },
  NOT_CONFIGURED: { tone: "gray", label: "Not set up" },
};

export function LocalSessionPanel({ url, hasKey, session, active }: { url: string; hasKey: boolean; session: string; active: boolean }) {
  const [form, setForm] = useState({ url, apiKey: "", session });
  const [state, setState] = useState<SessionState | null>(null);
  const [saving, startSave] = useTransition();
  const [busy, startBusy] = useTransition();
  const router = useRouter();

  const refresh = useCallback(async () => setState(await getSessionState()), []);

  useEffect(() => {
    let alive = true;
    getSessionState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  // Poll while the phone is being linked.
  const linking = state?.status === "STARTING" || state?.status === "SCAN_QR_CODE";
  useEffect(() => {
    if (!linking) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [linking, refresh]);

  const s = state ? STATUS_TEXT[state.status] : null;

  return (
    <Card className="card-3d">
      <CardHeader
        tone="info"
        icon={<Phone3D />}
        title="Local session (WAHA)"
        description="A WAHA server on your VPS keeps a WhatsApp number linked, like WhatsApp Web."
        action={active ? <Badge tone="green" dot>Active</Badge> : undefined}
      />
      <form
        className="grid gap-4 border-b border-line p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          startSave(async () => {
            const r = await saveWahaSettings(form);
            toastResult(r);
            if (r.ok) {
              setForm((f) => ({ ...f, apiKey: "" }));
              router.refresh();
              refresh();
            }
          });
        }}
      >
        <Field id="wurl" label="WAHA server URL" className="sm:col-span-2">
          <input inputMode="url" autoComplete="off" className="field" placeholder="https://waha.yourdomain.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </Field>
        <Field id="wkey" label="API key" hint={hasKey ? "saved · leave blank to keep" : undefined}>
          <input type="password" autoComplete="off" className="field" placeholder={hasKey ? "••••••••" : "WAHA_API_KEY"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
        </Field>
        <Field id="wses" label="Session name" hint="free WAHA: default">
          <input autoCapitalize="off" spellCheck={false} className="field font-mono" value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" className="max-sm:w-full" loading={saving}>
            Save WAHA details
          </Button>
        </div>
      </form>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
            <span className="text-sm font-medium text-ink">Phone</span>
            {s ? <Badge tone={s.tone} dot>{s.label}</Badge> : <Spinner className="text-muted" />}
            {state?.status === "WORKING" && state.phone && (
              <span className="tabular text-sm text-ink-2">+{state.phone}{state.name ? ` · ${state.name}` : ""}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon onClick={refresh} title="Refresh status" aria-label="Refresh status"><RefreshCw aria-hidden className="size-4 shrink-0" /></Button>
            {state && !["WORKING", "NOT_CONFIGURED", "SCAN_QR_CODE", "STARTING"].includes(state.status) && (
              <Button
                size="sm"
                loading={busy}
                onClick={() => startBusy(async () => {
                  toastResult(await connectSession());
                  await refresh();
                })}
              >
                <QrCode aria-hidden className="size-4 shrink-0" /> Link phone
              </Button>
            )}
            {state?.status === "WORKING" && (
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                onClick={async () => {
                  if (!(await confirmAction({ message: "Unlink this phone? Campaigns using the local session will pause until a phone is linked again.", confirmLabel: "Unlink phone", danger: true }))) return;
                  startBusy(async () => {
                    toastResult(await disconnectSession("logout"));
                    await refresh();
                  });
                }}
              >
                <LogOut aria-hidden className="size-4 shrink-0" /> Unlink phone
              </Button>
            )}
          </div>
        </div>

        {state?.status === "SCAN_QR_CODE" && (
          <div className="mt-5 flex flex-col items-center gap-5 rounded-card bg-sunken p-4 sm:flex-row sm:items-start sm:p-5">
            <div className="grid size-56 shrink-0 place-items-center rounded-card bg-white p-3 shadow-card">
              {state.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={state.qr} alt="WhatsApp QR code to link the business phone" width={200} height={200} className="size-full" />
              ) : (
                <Spinner className="size-6 text-muted" />
              )}
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-ink-2">
              <li>Open <b>WhatsApp</b> on the business phone.</li>
              <li>Tap <b>⋮ / Settings → Linked devices → Link a device</b>.</li>
              <li>Point the camera at this code. It refreshes by itself.</li>
            </ol>
          </div>
        )}
        {state?.status === "WORKING" && (
          <p className="mt-3 flex items-center gap-2 text-xs text-success"><CheckCircle2 aria-hidden className="size-3.5 shrink-0" /> Ready. Delivery and read receipts arrive automatically.</p>
        )}
        {state?.error && (
          <p role="alert" className="mt-3 flex items-center gap-2 text-xs text-danger"><TriangleAlert aria-hidden className="size-3.5 shrink-0" /> {state.error}</p>
        )}
        {state?.status === "NOT_CONFIGURED" && <p className="mt-3 text-xs text-muted">Save the WAHA server details above to link a phone.</p>}
      </div>
    </Card>
  );
}
