"use client";

import { CheckCheck, ImagePlus, Send, Sparkles, X } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Badge, Button } from "@/components/ui";
import type { ReplyAnalysisResult } from "@/lib/ai";
import { getAiSmartRepliesAction } from "../actions/ai";
import { uploadProductImage } from "../actions/catalog";
import { setReplyHandled } from "../actions/replies";
import { replyToCustomer } from "../actions/send";

/**
 * Inline quick-reply composer inside the desktop `/dashboard/replies` split-pane.
 * Includes Free AI Smart Reply suggestions (English / Tanglish / Tamil) + customer intent detection.
 */
export function InlineReplyBox({
  customerId,
  customerName,
  replyId,
  replyHandled,
  windowOpen,
}: {
  customerId: string;
  customerName: string;
  replyId: string;
  replyHandled: boolean;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const [aiResult, setAiResult] = useState<ReplyAnalysisResult | null>(null);
  const [aiLoading, startAi] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();

  if (!windowOpen) {
    return (
      <div className="border-t border-line bg-sunken/60 px-4 py-2.5 text-xs text-muted sm:px-5">
        24-hour free service reply window has closed for {customerName}. Open their profile to send an approved template (Utility ₹0.115 / Marketing ₹0.8631).
      </div>
    );
  }

  const runAiSuggest = () => {
    startAi(async () => {
      const res = await getAiSmartRepliesAction(customerId);
      if (res.ok && res.data) {
        setAiResult(res.data);
      } else {
        toastResult({ ok: false, message: res.message ?? "Could not generate AI suggestions." });
      }
    });
  };

  const submit = (alsoMarkHandled: boolean) => {
    if (!text.trim() && !mediaUrl.trim()) return;
    startSend(async () => {
      const r = await replyToCustomer(customerId, text, mediaUrl || null);
      toastResult(r);
      if (r.ok) {
        if (alsoMarkHandled && !replyHandled) {
          await setReplyHandled(replyId, true);
        }
        setText("");
        setMediaUrl("");
        setShowMedia(false);
        setAiResult(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 border-t border-line bg-subtle/40 px-3.5 py-2.5 sm:px-5 sm:py-3">
      {/* Free AI Smart Reply Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={aiLoading}
            onClick={runAiSuggest}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/60 px-2.5 py-0.5 text-[11px] font-semibold text-brand-deep transition hover:bg-brand-soft disabled:opacity-60"
          >
            <Sparkles aria-hidden className="size-3.5" />
            {aiLoading ? "Analyzing chat…" : aiResult ? "Refresh AI replies" : "AI Smart Reply (EN / Tanglish / தமிழ்)"}
          </button>
          <span className="text-[10px] text-muted">Free 24h window (1,000/mo free)</span>
        </div>

        {aiResult && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={aiResult.urgency === "HIGH" ? "amber" : "green"} dot>
              {aiResult.intentLabel}
            </Badge>
            <button
              type="button"
              onClick={() => setAiResult(null)}
              className="text-[11px] text-muted hover:text-ink"
              aria-label="Hide AI suggestions"
            >
              Hide
            </button>
          </div>
        )}
      </div>

      {aiResult && (
        <div className="space-y-1.5 rounded-control border border-brand/25 bg-panel/90 p-2.5 text-xs">
          <p className="text-[11px] text-muted">{aiResult.summary}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {aiResult.suggestions.map((s) => (
              <button
                key={s.lang}
                type="button"
                onClick={() => setText(s.text)}
                className="flex flex-col items-start rounded-control border border-line bg-subtle/50 p-2 text-left transition hover:border-brand hover:bg-brand-soft/30"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-deep">
                  {s.lang} · {s.label}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] text-ink">{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(showMedia || mediaUrl) && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-panel px-2.5 py-1.5 text-xs">
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
            placeholder="Paste image/PDF https:// link or upload file →"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
          />
          <label className="cursor-pointer font-semibold text-brand-deep hover:underline">
            {uploading ? "Uploading…" : "Upload photo/PDF"}
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
          <button
            type="button"
            aria-label="Close attachment"
            onClick={() => {
              setMediaUrl("");
              setShowMedia(false);
            }}
            className="rounded-control p-1 text-muted hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
        <textarea
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(false);
            }
          }}
          placeholder={`Write a WhatsApp reply to ${customerName}… (Ctrl+Enter to send)`}
          className="field min-h-11 w-full flex-1 resize-none py-2 text-sm"
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowMedia((v) => !v)}
            title="Attach photo or PDF"
            aria-label="Attach photo or PDF"
            className="grid size-10 shrink-0 place-items-center rounded-control border border-line bg-panel text-muted transition hover:border-line-strong hover:text-brand-deep"
          >
            <ImagePlus aria-hidden className="size-4" />
          </button>
          <Button
            type="button"
            size="md"
            disabled={!text.trim() && !mediaUrl.trim()}
            loading={sending}
            onClick={() => submit(false)}
          >
            <Send aria-hidden className="size-4" /> Send
          </Button>
          {!replyHandled && (
            <Button
              type="button"
              size="md"
              variant="secondary"
              disabled={!text.trim() && !mediaUrl.trim()}
              loading={sending}
              onClick={() => submit(true)}
              title="Send reply and mark this message handled"
            >
              <CheckCheck aria-hidden className="size-4" /> Send &amp; close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
