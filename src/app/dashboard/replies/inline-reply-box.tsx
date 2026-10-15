"use client";

import { ChevronDown, ImagePlus, MessageCircle, Plus, Sparkles, X } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Badge } from "@/components/ui";
import type { ReplyAnalysisResult } from "@/lib/ai";
import { getAiSmartRepliesAction } from "../actions/ai";
import { uploadProductImage } from "../actions/catalog";
import { setReplyHandled } from "../actions/replies";
import { replyToCustomer } from "../actions/send";
import { cn } from "@/lib/cn";

/**
 * WhatsApp-styled quick reply composer matching the clean chat mock.
 * Includes language selector, AI Smart Replies, photo/PDF attachment, and Send actions.
 */
export function InlineReplyBox({
  customerId,
  customerName,
  replyId,
  replyHandled,
  windowOpen,
  onTypingChange,
}: {
  customerId: string;
  customerName: string;
  replyId: string;
  replyHandled: boolean;
  windowOpen: boolean;
  onTypingChange?: (isTyping: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const [selectedLang, setSelectedLang] = useState<"EN" | "Tanglish" | "Tamil">("EN");
  const [aiResult, setAiResult] = useState<ReplyAnalysisResult | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [aiLoading, startAi] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();

  if (!windowOpen) {
    return (
      <div className="m-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-bg px-4 py-3 text-sm">
        <div className="text-muted">
          <span className="font-semibold text-warning">Free replies have closed for this chat.</span>
          <span className="ml-1 text-ink-2">Send a template to start talking again.</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/customers/${customerId}#reply`}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl bg-brand px-3.5 py-1 text-xs font-bold text-on-brand shadow-xs hover:brightness-105"
          >
            <MessageCircle className="size-3.5" /> Send template
          </Link>
          <Link
            href={`/dashboard/customers/${customerId}`}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-line bg-card px-3 py-1 text-xs font-semibold text-ink hover:bg-subtle dark:bg-[#132A3B]"
          >
            Profile
          </Link>
        </div>
      </div>
    );
  }

  const runAiSuggest = () => {
    startAi(async () => {
      const res = await getAiSmartRepliesAction(customerId);
      if (res.ok && res.data) {
        setAiResult(res.data);
        const match = res.data.suggestions.find((s) => s.lang.toLowerCase() === selectedLang.toLowerCase());
        if (match) {
          setText(match.text);
        } else if (res.data.suggestions[0]) {
          setText(res.data.suggestions[0].text);
        }
      } else {
        toastResult({ ok: false, message: res.message ?? "Could not generate AI suggestions." });
      }
    });
  };

  const handleLangChange = (lang: "EN" | "Tanglish" | "Tamil") => {
    setSelectedLang(lang);
    if (aiResult) {
      const match = aiResult.suggestions.find((s) => s.lang.toLowerCase() === lang.toLowerCase());
      if (match) setText(match.text);
    }
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
        onTypingChange?.(false);
        router.refresh();
      }
    });
  };

  const ctl = "inline-flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-line bg-panel px-4 text-[14.5px] font-semibold text-ink transition hover:border-ink disabled:opacity-50";

  return (
    <div className="space-y-3 px-5 pb-5 pt-4">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="reply-input" className="text-[15px] font-semibold text-ink">
          Your reply
        </label>
        {aiResult && (
          <div className="flex items-center gap-2">
            <Badge tone={aiResult.urgency === "HIGH" ? "amber" : "green"} dot>
              {aiResult.intentLabel}
            </Badge>
            <button type="button" onClick={() => setAiResult(null)} className="text-[12px] text-muted underline hover:text-ink">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Suggested replies, one per language. */}
      {aiResult && (
        <div className="space-y-2 rounded-xl border border-brand/40 bg-brand-soft/50 p-3 text-xs">
          <p className="text-[12px] text-muted">{aiResult.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {aiResult.suggestions.map((s) => (
              <button
                key={s.lang}
                type="button"
                onClick={() => {
                  setText(s.text);
                  onTypingChange?.(true);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-left text-xs transition",
                  text === s.text ? "border-brand bg-brand-soft font-semibold text-ink" : "border-line bg-panel text-muted hover:border-brand hover:text-ink",
                )}
              >
                <span className="mr-1 font-semibold text-brand-deep">[{s.lang}]</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Photo or PDF to send with the reply. */}
      {(showMedia || mediaUrl) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 text-xs">
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            placeholder="Paste an image or PDF link, or upload"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
          />
          <label className="cursor-pointer text-sm font-semibold text-brand-deep hover:underline">
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
            aria-label="Remove attachment"
            onClick={() => {
              setMediaUrl("");
              setShowMedia(false);
            }}
            className="rounded-control p-1 text-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <textarea
        id="reply-input"
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTypingChange?.(e.target.value.trim().length > 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit(false);
          }
        }}
        placeholder="Type a reply"
        className="min-h-24 w-full resize-y rounded-xl border-[1.5px] border-line bg-panel px-4 py-3 text-[15px] text-ink transition placeholder:text-muted focus:border-ink focus:outline-none"
      />

      {/* Language and the reply helper. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Reply language</span>
          <select
            value={selectedLang}
            onChange={(e) => handleLangChange(e.target.value as "EN" | "Tanglish" | "Tamil")}
            className={cn(ctl, "appearance-none pr-9")}
          >
            <option value="EN">English</option>
            <option value="Tanglish">Tanglish</option>
            <option value="Tamil">தமிழ்</option>
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        </label>
        <button type="button" disabled={aiLoading} onClick={runAiSuggest} className={ctl}>
          <Sparkles aria-hidden className="size-4 text-brand-deep" />
          {aiLoading ? "Thinking…" : "Suggest a reply"}
        </button>
      </div>

      {/* Send, send and close, and the rest under More. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={(!text.trim() && !mediaUrl.trim()) || sending}
          onClick={() => submit(false)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-5 text-[14.5px] font-bold text-on-brand transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        {!replyHandled && (
          <button type="button" disabled={(!text.trim() && !mediaUrl.trim()) || sending} onClick={() => submit(true)} className={ctl}>
            Send and close
          </button>
        )}
        <div className="relative">
          <button type="button" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)} className={cn(ctl, "text-muted")}>
            More <Plus aria-hidden className="size-4" />
          </button>
          {showMore && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
              <button
                type="button"
                onClick={() => {
                  setShowMedia(true);
                  setShowMore(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-ink hover:bg-sunken"
              >
                <ImagePlus aria-hidden className="size-4 text-muted" /> Attach photo or PDF
              </button>
              <Link
                href={`/dashboard/customers/${customerId}#reply`}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink hover:bg-sunken"
              >
                <MessageCircle aria-hidden className="size-4 text-muted" /> Send a template
              </Link>
              <p className="border-t border-line px-3 pb-1 pt-2 text-[11.5px] text-muted">Ctrl + Enter sends.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
