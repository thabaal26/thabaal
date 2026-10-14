"use client";

import { CheckCheck, ImagePlus, Send, Sparkles, X, ChevronDown, MessageCircle } from "@/components/icons";
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
  const [selectedLang, setSelectedLang] = useState<"EN" | "Tanglish" | "Tamil">("EN");
  const [aiResult, setAiResult] = useState<ReplyAnalysisResult | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [aiLoading, startAi] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();

  if (!windowOpen) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/60 px-5 py-3.5 text-xs">
        <div className="text-muted">
          <span className="font-semibold text-amber-700 dark:text-amber-400">24-hour free reply window has closed.</span>
          <span className="ml-1">Send an approved WhatsApp template to restart the conversation.</span>
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
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 border-t border-line bg-card/90 px-5 py-3.5 backdrop-blur-md">
      {/* Label matching mock: "Your reply" */}
      <div className="flex items-center justify-between">
        <label htmlFor="reply-input" className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          Your reply
        </label>
        {aiResult && (
          <div className="flex items-center gap-2">
            <Badge tone={aiResult.urgency === "HIGH" ? "amber" : "green"} dot>
              {aiResult.intentLabel}
            </Badge>
            <button
              type="button"
              onClick={() => setAiResult(null)}
              className="text-[11px] text-muted hover:text-ink underline"
            >
              Clear AI
            </button>
          </div>
        )}
      </div>

      {/* AI Suggestions Pill Bar */}
      {aiResult && (
        <div className="space-y-2 rounded-xl border border-brand/30 bg-[#FFFDF9] dark:bg-[#132A3B] p-2.5 text-xs">
          <p className="text-[11px] text-muted">{aiResult.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {aiResult.suggestions.map((s) => (
              <button
                key={s.lang}
                type="button"
                onClick={() => setText(s.text)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-left text-xs transition",
                  text === s.text
                    ? "border-brand bg-brand-soft font-semibold text-ink"
                    : "border-line bg-card text-muted hover:border-brand hover:text-ink",
                )}
              >
                <span className="font-semibold text-brand-deep mr-1">[{s.lang}]</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media Attachment Bar */}
      {(showMedia || mediaUrl) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs">
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
            placeholder="Paste image or PDF link, or upload →"
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

      {/* Reply Textarea matching WhatsApp Mock */}
      <textarea
        id="reply-input"
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
        placeholder="Type a reply"
        className="w-full resize-none rounded-xl border border-line bg-panel p-3 text-[14px] text-ink placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:bg-[#132A3B]"
      />

      {/* Composer Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Language Select + Suggest a reply */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedLang}
              onChange={(e) => handleLangChange(e.target.value as "EN" | "Tanglish" | "Tamil")}
              className="appearance-none rounded-lg border border-line bg-card py-1.5 pl-3 pr-7 text-xs font-semibold text-ink shadow-2xs hover:bg-subtle focus:border-brand focus:outline-none dark:bg-[#132A3B]"
            >
              <option value="EN">English</option>
              <option value="Tanglish">Tanglish</option>
              <option value="Tamil">தமிழ்</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3 text-muted" />
          </div>

          <button
            type="button"
            disabled={aiLoading}
            onClick={runAiSuggest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs transition hover:border-brand hover:bg-brand-soft/40 disabled:opacity-60 dark:bg-[#132A3B]"
          >
            <Sparkles className="size-3.5 text-amber-500 shrink-0" />
            <span>{aiLoading ? "Thinking…" : "Suggest a reply"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMedia((v) => !v)}
            title="Attach photo or PDF"
            className="grid size-8 place-items-center rounded-lg border border-line bg-card text-muted transition hover:border-brand hover:text-ink dark:bg-[#132A3B]"
          >
            <ImagePlus className="size-4" />
          </button>

          <Link
            href={`/dashboard/customers/${customerId}#reply`}
            title="Send an approved WhatsApp template"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-ink dark:bg-[#132A3B] dark:text-white"
          >
            <MessageCircle className="size-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Template</span>
          </Link>
        </div>

        {/* Right: Send, Send & Close, More */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!text.trim() && !mediaUrl.trim()}
            onClick={() => submit(false)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-brand px-4 py-1.5 text-xs font-bold text-on-brand shadow-xs transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            <Send className="size-3.5" />
            <span>{sending ? "Sending…" : "Send"}</span>
          </button>

          {!replyHandled && (
            <button
              type="button"
              disabled={!text.trim() && !mediaUrl.trim()}
              onClick={() => submit(true)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-1.5 text-xs font-semibold text-ink shadow-2xs transition hover:bg-subtle active:scale-[0.98] disabled:opacity-50 dark:bg-[#132A3B]"
            >
              <CheckCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Send and close</span>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink dark:bg-[#132A3B]"
            >
              <span>More +</span>
            </button>
            {showMore && (
              <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-line bg-card p-1.5 shadow-xl dark:bg-[#132A3B]">
                <button
                  type="button"
                  onClick={() => {
                    setShowMedia(true);
                    setShowMore(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:bg-subtle dark:text-white"
                >
                  <ImagePlus className="size-4 text-muted" /> Attach photo/PDF
                </button>
                <div className="my-1 border-t border-line" />
                <p className="px-2.5 py-1 text-[11px] text-muted">Press Ctrl+Enter to send quickly</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
