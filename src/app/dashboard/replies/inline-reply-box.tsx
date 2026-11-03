"use client";

import { MessageCircle, Paperclip, ReceiptText, Send, Smile, Sparkles, X } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import type { ReplyAnalysisResult } from "@/lib/ai";
import { useLanguage } from "@/lib/i18n/context";
import { getAiSmartRepliesAction } from "../actions/ai";
import { uploadProductImage } from "../actions/catalog";
import { shrinkImage } from "@/lib/shrink-image";
import { setReplyHandled } from "../actions/replies";
import { replyToCustomer } from "../actions/send";

/** The emoji a shop types most: greetings, thanks, orders, delivery, payment. */
const EMOJI = ["🙏", "😊", "👍", "❤️", "🎉", "✅", "👌", "🤝", "😀", "😂", "😍", "🤗", "👋", "🙂", "⭐", "🔥", "💯", "✨", "🎁", "🛒", "📦", "🚚", "💰", "📞", "⏰", "📍", "🌿", "🥥", "🍯", "🌶️", "🧈", "🫙"];

const ic = { width: 15, height: 15 };

/**
 * The chat's composer, as in WhatsApp: emoji, attach, the message box and a round send button, with quick actions
 * above it (suggest a reply, reply language, send products, create order, mark handled). Enter sends on a computer;
 * Shift + Enter starts a new line. When the 24-hour window is closed only a template can be sent.
 */
export function InlineReplyBox({
  customerId,
  replyId,
  replyHandled,
  windowOpen,
  windowLeft,
  createOrderHref,
  onTypingChange,
  actions,
}: {
  customerId: string;
  replyId: string;
  replyHandled: boolean;
  windowOpen: boolean;
  /** "14h 15m left": shown on phones, where the header has no room for it. */
  windowLeft?: string | null;
  createOrderHref: string;
  onTypingChange?: (isTyping: boolean) => void;
  /** Quick actions from the chat (mark paid, send products, mark handled), shown as chips. */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [selectedLang, setSelectedLang] = useState<"EN" | "Tanglish" | "Tamil">("EN");
  const [aiResult, setAiResult] = useState<ReplyAnalysisResult | null>(null);
  const [aiLoading, startAi] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // The message box grows with the text, up to about six lines, like WhatsApp's.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);

  useEffect(() => {
    if (!showEmoji) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowEmoji(false);
    const onDown = (e: PointerEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [showEmoji]);

  if (!windowOpen) {
    return (
      <div className="wa-closed">
        <p>
          <b className="down">{isTamil ? "இந்த உரையாடலுக்கான இலவச பதில் நேரம் முடிந்துவிட்டது." : "Free replies have closed for this chat."}</b>{" "}
          {isTamil ? "மீண்டும் பேச Meta அங்கீகரித்த டெம்ப்ளேட் அனுப்பவும்." : "Send a template to start talking again."}
        </p>
        <div className="wa-qr" style={{ padding: 0, flexWrap: "wrap" }}>
          <Link className="btn primary sm" href={`/dashboard/customers/${customerId}#reply`}>
            <MessageCircle aria-hidden className="ic shrink-0" style={ic} /> {isTamil ? "டெம்ப்ளேட் அனுப்பு" : "Send template"}
          </Link>
          {actions}
        </div>
      </div>
    );
  }

  const setTyped = (v: string) => {
    setText(v);
    onTypingChange?.(v.trim().length > 0);
  };

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

  const insertEmoji = (emoji: string) => {
    const el = boxRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setTyped(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const canSend = (text.trim() || mediaUrl.trim()) && !sending;
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
    <div className="wa-comp">
      <div className="wa-qr" role="group" aria-label={isTamil ? "விரைவு செயல்கள்" : "Quick actions"}>
        <button type="button" className="wa-qc" disabled={aiLoading} onClick={runAiSuggest}>
          <Sparkles aria-hidden className="ic" style={ic} />
          {aiLoading ? (isTamil ? "யோசிக்கிறது…" : "Thinking…") : isTamil ? "AI பதில் பரிந்துரை" : "Suggest a reply"}
        </button>
        <select className="wa-qc" value={selectedLang} onChange={(e) => handleLangChange(e.target.value as "EN" | "Tanglish" | "Tamil")} aria-label={isTamil ? "பதில் மொழி" : "Reply language"}>
          <option value="EN">English</option>
          <option value="Tanglish">Tanglish</option>
          <option value="Tamil">தமிழ்</option>
        </select>
        {actions}
        <Link className="wa-qc" href={createOrderHref}>
          <ReceiptText aria-hidden className="ic" style={ic} /> {isTamil ? "ஆர்டர் உருவாக்கு" : "Create order"}
        </Link>
        <Link className="wa-qc" href={`/dashboard/customers/${customerId}#reply`}>
          <MessageCircle aria-hidden className="ic" style={ic} /> {isTamil ? "டெம்ப்ளேட் அனுப்பு" : "Send template"}
        </Link>
      </div>

      {aiResult && (
        <div className="wa-ai">
          <div className="row1">
            <span className={`pill ${aiResult.urgency === "HIGH" ? "warn" : "ok"}`}>{aiResult.intentLabel}</span>
            <p>{aiResult.summary}</p>
            <button type="button" className="linkb small" onClick={() => setAiResult(null)}>
              {isTamil ? "அழிக்க" : "Clear"}
            </button>
          </div>
          <div className="wa-qr" style={{ padding: 0, flexWrap: "wrap" }}>
            {aiResult.suggestions.map((s) => (
              <button key={s.lang} type="button" className={`wa-qc${text === s.text ? " on" : ""}`} aria-pressed={text === s.text} onClick={() => setTyped(s.text)}>
                [{s.lang}] {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(showMedia || mediaUrl) && (
        <div className="wa-att">
          <input
            type="text"
            aria-label={isTamil ? "படம் அல்லது PDF இணைப்பு" : "Image or PDF link"}
            placeholder={isTamil ? "படம் அல்லது PDF இணைப்பை ஒட்டவும், அல்லது பதிவேற்றவும்" : "Paste an image or PDF link, or upload"}
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
          />
          <label className="btn sm" style={{ cursor: "pointer" }}>
            {uploading ? (isTamil ? "ஏற்றப்படுகிறது…" : "Uploading…") : isTamil ? "படம்/PDF பதிவேற்றுக" : "Upload photo/PDF"}
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
                  fd.set("file", await shrinkImage(file));
                  const res = await uploadProductImage(fd).catch(() => ({ ok: false as const, url: undefined, message: "Upload failed. Check your connection and try again." }));
                  if (res.ok && res.url) setMediaUrl(res.url);
                  else toastResult({ ok: false, message: res.message ?? "Upload failed." });
                });
              }}
            />
          </label>
          <button
            type="button"
            className="wa-ib"
            aria-label={isTamil ? "இணைப்பை நீக்குக" : "Remove attachment"}
            onClick={() => {
              setMediaUrl("");
              setShowMedia(false);
            }}
          >
            <X aria-hidden className="ic" />
          </button>
        </div>
      )}

      <div className="wa-bar">
        <div ref={emojiRef} style={{ position: "static" }}>
          <button type="button" className="wa-ib" aria-label={isTamil ? "எமோஜி" : "Emoji"} aria-expanded={showEmoji} onClick={() => setShowEmoji((v) => !v)}>
            <Smile aria-hidden className="ic" />
          </button>
          {showEmoji && (
            <div className="wa-pop" role="group" aria-label={isTamil ? "எமோஜி தேர்வு" : "Pick an emoji"}>
              {EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => insertEmoji(e)} aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="wa-ib" aria-label={isTamil ? "படம் அல்லது PDF இணைக்க" : "Attach photo or PDF"} aria-expanded={showMedia} onClick={() => setShowMedia((v) => !v)}>
          <Paperclip aria-hidden className="ic" />
        </button>
        <textarea
          ref={boxRef}
          id="reply-input"
          rows={1}
          maxLength={4000}
          value={text}
          aria-label={isTamil ? "உங்கள் பதில்" : "Your reply"}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            // Ctrl/⌘ + Enter always sends; plain Enter sends on a computer (on a phone it's a new line).
            const computer = window.matchMedia("(pointer: fine)").matches;
            if (e.metaKey || e.ctrlKey || (computer && !e.shiftKey)) {
              e.preventDefault();
              submit(false);
            }
          }}
          placeholder={isTamil ? "செய்தி எழுதவும்" : "Type a message"}
        />
        <button type="button" className="wa-send" disabled={!canSend} onClick={() => submit(false)} aria-label={sending ? (isTamil ? "அனுப்பப்படுகிறது…" : "Sending…") : isTamil ? "அனுப்புக" : "Send"}>
          <Send aria-hidden className="ic" />
        </button>
      </div>
      <p className="wa-hint">
        {!replyHandled && canSend && (
          <>
            <button type="button" className="linkb small" onClick={() => submit(true)}>
              {isTamil ? "அனுப்பி முடிக்க" : "Send and close"}
            </button>
            {" · "}
          </>
        )}
        {windowLeft && (
          <span className="wa-win-sm">
            {isTamil ? `இலவச பதில் · ${windowLeft} · ` : `Free replies · ${windowLeft} · `}
          </span>
        )}
        {isTamil ? "Enter அனுப்பும் · Shift + Enter புதிய வரி" : "Enter sends · Shift + Enter for a new line"}
      </p>
    </div>
  );
}
