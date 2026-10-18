"use client";

import { ImagePlus, MessageCircle, Sparkles, X } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import type { ReplyAnalysisResult } from "@/lib/ai";
import { useLanguage } from "@/lib/i18n/context";
import { getAiSmartRepliesAction } from "../actions/ai";
import { uploadProductImage } from "../actions/catalog";
import { setReplyHandled } from "../actions/replies";
import { replyToCustomer } from "../actions/send";

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
  more,
}: {
  customerId: string;
  customerName: string;
  replyId: string;
  replyHandled: boolean;
  windowOpen: boolean;
  onTypingChange?: (isTyping: boolean) => void;
  /** Extra chat actions (mark handled, mark paid, send catalogue) shown under "More". */
  more?: React.ReactNode;
}) {
  const router = useRouter();
  const { isTamil } = useLanguage();
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
      <>
        <div className="note" style={{ marginTop: 14 }}>
          <b className="down">
            {isTamil ? "இந்த உரையாடலுக்கான இலவச பதில் நேரம் முடிந்துவிட்டது." : "Free replies have closed for this chat."}
          </b>{" "}
          {isTamil ? "மீண்டும் பேச Meta அங்கீகரித்த டெம்ப்ளேட் அனுப்பவும்." : "Send a template to start talking again."}
        </div>
        <div className="tools" style={{ marginTop: 12 }}>
          <Link className="btn primary sm" href={`/dashboard/customers/${customerId}#reply`}>
            <MessageCircle aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> {isTamil ? "டெம்ப்ளேட் அனுப்பு" : "Send template"}
          </Link>
          {more}
        </div>
      </>
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

  return (
    <div>
      <div className="field" style={{ marginTop: 14 }}>
        <div className="row" style={{ padding: 0, border: 0 }}>
          <label htmlFor="reply-input" className="grow" style={{ minWidth: 0 }}>
            {isTamil ? "உங்கள் பதில்" : "Your reply"}
          </label>
          {aiResult && (
            <>
              <span className={`pill ${aiResult.urgency === "HIGH" ? "warn" : "ok"}`}>{aiResult.intentLabel}</span>
              <button type="button" className="linkb small" onClick={() => setAiResult(null)}>
                {isTamil ? "அழிக்க" : "Clear"}
              </button>
            </>
          )}
        </div>

        {aiResult && (
          <div className="note small">
            <p className="muted">{aiResult.summary}</p>
            <div className="chips" style={{ marginTop: 8 }}>
              {aiResult.suggestions.map((s) => (
                <button
                  key={s.lang}
                  type="button"
                  className="chip"
                  aria-pressed={text === s.text}
                  onClick={() => {
                    setText(s.text);
                    onTypingChange?.(true);
                  }}
                >
                  [{s.lang}] {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(showMedia || mediaUrl) && (
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <input
              type="text"
              aria-label={isTamil ? "படம் அல்லது PDF இணைப்பு" : "Image or PDF link"}
              style={{ flex: 1, minWidth: 180 }}
              placeholder={isTamil ? "படம் அல்லது PDF இணைப்பை ஒட்டவும், அல்லது பதிவேற்றவும்" : "Paste an image or PDF link, or upload"}
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
            />
            <label className="btn sm" style={{ cursor: "pointer" }}>
              {uploading ? (isTamil ? "ஏற்றப்படுகிறது…" : "Uploading…") : (isTamil ? "படம்/PDF பதிவேற்றுக" : "Upload photo/PDF")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hx"
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
              className="btn sm ghost"
              aria-label={isTamil ? "இணைப்பை நீக்குக" : "Remove attachment"}
              onClick={() => {
                setMediaUrl("");
                setShowMedia(false);
              }}
            >
              <X aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} />
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
          placeholder={
            customerName
              ? isTamil
                ? `${customerName}-க்கு பதில் எழுதவும்…`
                : `Type a reply to ${customerName}…`
              : isTamil
              ? "பதில் எழுதவும்…"
              : "Type a reply…"
          }
        />
      </div>

      <div className="tools" style={{ marginTop: 10 }}>
        <select value={selectedLang} onChange={(e) => handleLangChange(e.target.value as "EN" | "Tanglish" | "Tamil")} style={{ width: "auto" }} aria-label={isTamil ? "பதில் மொழி" : "Reply language"}>
          <option value="EN">English</option>
          <option value="Tanglish">Tanglish</option>
          <option value="Tamil">தமிழ்</option>
        </select>
        <button type="button" className="btn sm" disabled={aiLoading} onClick={runAiSuggest}>
          <Sparkles aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} />
          {aiLoading ? (isTamil ? "யோசிக்கிறது…" : "Thinking…") : (isTamil ? "AI பதில் பரிந்துரை" : "Suggest a reply")}
        </button>
      </div>

      <div className="tools" style={{ marginTop: 14 }}>
        <button type="button" className="btn primary" disabled={(!text.trim() && !mediaUrl.trim()) || sending} onClick={() => submit(false)}>
          {sending ? (isTamil ? "அனுப்பப்படுகிறது…" : "Sending…") : (isTamil ? "அனுப்புக" : "Send")}
        </button>
        {!replyHandled && (
          <button type="button" className="btn" disabled={(!text.trim() && !mediaUrl.trim()) || sending} onClick={() => submit(true)}>
            {isTamil ? "அனுப்பி முடிக்க" : "Send and close"}
          </button>
        )}
        <details className="more" style={{ border: 0, margin: 0, padding: 0, position: "relative" }} open={showMore} onToggle={(e) => setShowMore(e.currentTarget.open)}>
          <summary style={{ padding: "8px 12px", border: "1.5px solid var(--line)", borderRadius: 12, display: "inline-flex" }}>
            {isTamil ? "மேலும்" : "More"}
          </summary>
          <div className="tools" style={{ marginTop: 8 }}>
            {more}
            <Link className="btn sm" href={`/dashboard/customers/${customerId}#reply`}>
              <MessageCircle aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> {isTamil ? "டெம்ப்ளேட் அனுப்பு" : "Send template"}
            </Link>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setShowMedia(true);
                setShowMore(false);
              }}
            >
              <ImagePlus aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> {isTamil ? "படம் அல்லது PDF இணைக்க" : "Attach photo or PDF"}
            </button>
          </div>
        </details>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        {isTamil ? "அனுப்ப Ctrl + Enter அழுத்தவும்." : "Ctrl + Enter sends."}
      </p>
    </div>
  );
}
