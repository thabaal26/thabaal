"use client";

import { ImagePlus, MessageSquareText, Send, Sparkles, X } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { toastResult } from "@/components/toast";
import { Button, Callout, Card, CardHeader, Field } from "@/components/ui";
import { renderFor, type TemplateButton, type VarMap } from "@/lib/template";
import { generateCustomerFollowUpAction } from "../../actions/ai";
import { uploadProductImage } from "../../actions/catalog";
import { replyToCustomer, sendToCustomer } from "../../actions/send";
import { templateLabel } from "@/lib/plain-error";
import { useTr } from "@/lib/i18n/context";

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
  const { tr, isTa } = useTr();
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [senderId, setSenderId] = useState(numbers[0]?.id ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [aiDrafting, startAiDraft] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();
  const [replying, startReply] = useTransition();

  const draftWithAi = (goal: "winback" | "payment_followup" | "vip_new_arrival") => {
    startAiDraft(async () => {
      const res = await generateCustomerFollowUpAction(customer.id, goal);
      if (res.ok && res.text) {
        setText(res.text);
      } else {
        toastResult({ ok: false, message: res.message ?? "Could not generate AI follow-up." });
      }
    });
  };

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
      <CardHeader title={`Message ${customer.name}`} titleTa={`${customer.name}-க்குச் செய்தி`} description="Send one message to this customer now, from your portal." />
      <div className="grid gap-6 p-4 sm:p-5 @2xl:grid-cols-2">
        {canSend && (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Send aria-hidden className="size-4 shrink-0 text-brand-deep" /> {tr("Send a template")}
            </p>
            {blocked ? (
              <Callout tone="warning">{blocked}</Callout>
            ) : templates.length ? (
              <>
                <Field id="tpl" label="Template">
                  <select className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((x) => <option key={x.id} value={x.id}>{templateLabel(x.name)} · {isTa ? tr(`${x.category.charAt(0)}${x.category.slice(1).toLowerCase()}`) : x.category.toLowerCase()}</option>)}
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
                    {t?.headerType === "IMAGE" && <p className="mb-1 text-xs text-muted">{isTa ? "[தலைப்புப் படம்]" : "[image header]"}</p>}
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
                  <Send aria-hidden className="size-4 shrink-0" /> {isTa ? `${customer.name.split(" ")[0]}-க்கு அனுப்பு` : `Send to ${customer.name.split(" ")[0]}`}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">{tr("No approved templates yet. Templates appear here once Meta approves them.")}</p>
            )}
          </div>
        )}

        <div className="scroll-mt-24 space-y-3" id="reply">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MessageSquareText aria-hidden className="size-4 shrink-0 text-brand-deep" /> {tr("Type a reply")}
            </p>
            {windowOpen && (
              <button
                type="button"
                onClick={() => setShowMediaInput((v) => !v)}
                className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand-deep hover:underline sm:min-h-0"
              >
                <ImagePlus aria-hidden className="size-3.5 shrink-0" />
                {tr(showMediaInput || mediaUrl ? "Hide attachment" : "Attach photo / PDF")}
              </button>
            )}
          </div>
          {windowOpen ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-deep">
                  <Sparkles aria-hidden className="size-3.5 shrink-0" /> {tr("Free AI Draft:")}
                </span>
                <button
                  type="button"
                  disabled={aiDrafting}
                  onClick={() => draftWithAi("winback")}
                  className="inline-flex min-h-10 items-center rounded-full border border-line bg-subtle px-3 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand-deep disabled:opacity-50 sm:min-h-0 sm:px-2.5"
                >
                  {tr("✨ Restock / Win-Back")}
                </button>
                <button
                  type="button"
                  disabled={aiDrafting}
                  onClick={() => draftWithAi("payment_followup")}
                  className="inline-flex min-h-10 items-center rounded-full border border-line bg-subtle px-3 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand-deep disabled:opacity-50 sm:min-h-0 sm:px-2.5"
                >
                  {tr("💳 Payment Reminder")}
                </button>
                <button
                  type="button"
                  disabled={aiDrafting}
                  onClick={() => draftWithAi("vip_new_arrival")}
                  className="inline-flex min-h-10 items-center rounded-full border border-line bg-subtle px-3 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand-deep disabled:opacity-50 sm:min-h-0 sm:px-2.5"
                >
                  {tr("🌟 VIP New Arrival")}
                </button>
              </div>
              <Field
                id="reply-text"
                label={isTa ? `${customer.name}-க்குப் பதில்` : `Reply to ${customer.name}`}
                help={
                  isTa
                    ? `அவர்கள் சமீபத்தில் உங்களுக்கு எழுதினார்கள், எனவே ${windowEndsAt} வரை தாராளமாகப் பதில் அனுப்பலாம் (ஒரு எண்ணுக்கு மாதம் 1,000 இலவசம்).`
                    : `They wrote to you recently, so you can reply freely until ${windowEndsAt} (1,000 free/mo per number).`
                }
              >
                <textarea className="field min-h-28" maxLength={4000} placeholder={isTa ? `${customer.name}-க்குப் பதில்…` : `Reply to ${customer.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
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
                        aria-label={isTa ? "இணைப்பை அழி" : "Clear attachment"}
                        onClick={() => setMediaUrl("")}
                        className="grid size-10 place-items-center rounded-control text-muted hover:bg-canvas hover:text-ink sm:size-8"
                      >
                        <X className="size-4 shrink-0" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{tr("Or upload a photo or PDF (max 4 MB):")}</span>
                    <label className="inline-flex min-h-10 cursor-pointer items-center font-semibold text-brand-deep hover:underline sm:min-h-0">
                      {tr(uploading ? "Uploading…" : "Choose file")}
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
                <Send aria-hidden className="size-4 shrink-0" /> Send reply
              </Button>
            </>
          ) : (
            <p className="rounded-control bg-sunken px-3 py-2 text-sm text-muted">
              {tr("Typed messages need the customer to have written to you in the last 24 hours. Until then, send a template.")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
