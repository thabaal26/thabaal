"use client";

import { ImagePlus, MessageSquareText, Send, X } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import { Button, Callout, Card, CardHeader, Field } from "@/components/ui";
import { renderFor, type TemplateButton, type VarMap } from "@/lib/template";
import { uploadProductImage } from "../../actions/catalog";
import { replyToCustomer, sendToCustomer } from "../../actions/send";

export type PanelTemplate = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerText: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  variables: unknown;
  buttons: unknown;
  codeExpiryMins: number | null;
  securityNote: boolean;
  businessAccountId: string | null;
};
export type PanelNumber = { id: string; label: string; businessAccountId: string };

/** Send one template to this customer, or type a reply while their 24-hour window is open. */
export function SendPanel({
  customer,
  templates,
  numbers,
  canSend,
  windowEndsAt,
  blocked,
}: {
  customer: { id: string; name: string; phone: string; location?: string | null; purchases?: string | null };
  templates: PanelTemplate[];
  numbers: PanelNumber[];
  /** Admins can send templates; client logins can only reply. */
  canSend: boolean;
  /** When the customer's last message turns 24 hours old; null if they haven't written or it has passed. */
  windowEndsAt: string | null;
  /** Why sending is off for this customer (opted out, unreachable), if it is. */
  blocked: string | null;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [senderId, setSenderId] = useState(numbers[0]?.id ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();
  const [replying, startReply] = useTransition();

  const t = templates.find((x) => x.id === templateId);
  // Meta only sends a template from numbers in the account that approved it.
  const usable = numbers.filter((n) => !t?.businessAccountId || n.businessAccountId === t.businessAccountId);
  const sender = usable.some((n) => n.id === senderId) ? senderId : (usable[0]?.id ?? "");
  const preview = t && renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, customer);
  const buttons = (t?.buttons ?? []) as TemplateButton[];
  const windowOpen = windowEndsAt !== null;

  const send = (force: boolean): void =>
    startSend(async () => {
      const r = await sendToCustomer(customer.id, templateId, sender || null, force, otpCode || undefined);
      // A soft warning (e.g. sent recently) asks before sending anyway.
      if (r.soft) {
        if (await confirmAction({ message: r.message ?? "Send anyway?", confirmLabel: "Send anyway" })) return send(true);
      } else toastResult(r);
      router.refresh();
    });

  return (
    <Card className="@container">
      <CardHeader title={`Message ${customer.name}`} description="Send one message to this customer now, from your portal." />
      <div className="grid gap-6 p-4 sm:p-5 @2xl:grid-cols-2">
        {canSend && (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Send aria-hidden className="size-4 text-brand-deep" /> Send a template
            </p>
            {blocked ? (
              <Callout tone="warning">{blocked}</Callout>
            ) : templates.length ? (
              <>
                <Field id="tpl" label="Template">
                  <select className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.category.toLowerCase()}</option>)}
                  </select>
                </Field>
                {numbers.length > 0 && (
                  <Field id="snd" label="Send from">
                    <select className="field" value={sender} onChange={(e) => setSenderId(e.target.value)}>
                      {usable.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                  </Field>
                )}
                {t?.category === "AUTHENTICATION" && (
                  <Field id="otp" label="One-time code" hint="optional — auto-generated if blank">
                    <input
                      className="field font-mono"
                      maxLength={10}
                      placeholder="e.g. 482910"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  </Field>
                )}
                {preview && (
                  <div aria-label="Preview" className="rounded-card rounded-tr-sm bg-bubble-out px-3 py-2 text-sm text-ink shadow-card">
                    {t?.headerType === "IMAGE" && <p className="mb-1 text-xs text-muted">[image header]</p>}
                    {preview.header && <p className="font-semibold">{preview.header}</p>}
                    <p className="whitespace-pre-wrap">
                      {t?.category === "AUTHENTICATION"
                        ? `${otpCode.trim() || "123456"} is your verification code.${t.securityNote ? " For your security, do not share this code." : ""}`
                        : preview.body}
                    </p>
                    {preview.footer && <p className="mt-1 text-xs text-muted">{preview.footer}</p>}
                    {buttons.length > 0 && <p className="mt-2 border-t border-black/10 pt-1.5 text-xs font-medium text-brand-deep">{buttons.map((b) => b.text).join(" · ")}</p>}
                  </div>
                )}
                <Button className="w-full" disabled={!templateId} loading={sending} onClick={() => send(false)}>
                  <Send aria-hidden className="size-4" /> Send to {customer.name.split(" ")[0]}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">No approved templates yet. Templates appear here once Meta approves them.</p>
            )}
          </div>
        )}

        <div className="scroll-mt-24 space-y-3" id="reply">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MessageSquareText aria-hidden className="size-4 text-brand-deep" /> Type a reply
            </p>
            {windowOpen && (
              <button
                type="button"
                onClick={() => setShowMediaInput((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
              >
                <ImagePlus aria-hidden className="size-3.5" />
                {showMediaInput || mediaUrl ? "Hide attachment" : "Attach photo / PDF"}
              </button>
            )}
          </div>
          {windowOpen ? (
            <>
              <Field id="reply-text" label={`Reply to ${customer.name}`} help={`They wrote to you recently, so you can reply freely until ${windowEndsAt}.`}>
                <textarea className="field min-h-28" maxLength={4000} placeholder={`Reply to ${customer.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              {(showMediaInput || mediaUrl) && (
                <div className="space-y-2 rounded-control border border-line bg-sunken/70 p-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      className="field flex-1 text-xs"
                      placeholder="https://… (image or PDF link)"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                    />
                    {mediaUrl && (
                      <button
                        type="button"
                        aria-label="Clear attachment"
                        onClick={() => setMediaUrl("")}
                        className="rounded-control p-1.5 text-muted hover:bg-canvas hover:text-ink"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>Or upload a photo or PDF (max 4 MB):</span>
                    <label className="cursor-pointer font-semibold text-brand-deep hover:underline">
                      {uploading ? "Uploading…" : "Choose file"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="sr-only"
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          startUpload(async () => {
                            const fd = new FormData();
                            fd.set("file", file);
                            const res = await uploadProductImage(fd);
                            if (res.ok && res.url) setMediaUrl(res.url);
                            else toastResult({ ok: false, message: res.message ?? "Upload failed." });
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!text.trim() && !mediaUrl.trim()}
                loading={replying}
                onClick={() =>
                  startReply(async () => {
                    const r = await replyToCustomer(customer.id, text, mediaUrl || null);
                    toastResult(r);
                    if (r.ok) {
                      setText("");
                      setMediaUrl("");
                      setShowMediaInput(false);
                    }
                    router.refresh();
                  })
                }
              >
                <Send aria-hidden className="size-4" /> Send reply
              </Button>
            </>
          ) : (
            <p className="rounded-control bg-sunken px-3 py-2 text-sm text-muted">
              Typed messages need the customer to have written to you in the last 24 hours. Until then, send a template.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
