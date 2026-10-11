"use client";

import { CheckCheck, ImagePlus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui";
import { uploadProductImage } from "../actions/catalog";
import { setReplyHandled } from "../actions/replies";
import { replyToCustomer } from "../actions/send";

/**
 * Inline quick-reply composer inside the desktop `/dashboard/replies` split-pane.
 * Lets staff type a message (or attach an image/PDF) and optionally mark the reply handled in one click.
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
  const [uploading, startUpload] = useTransition();
  const [sending, startSend] = useTransition();

  if (!windowOpen) {
    return (
      <div className="border-t border-line bg-sunken/60 px-5 py-2.5 text-xs text-muted">
        24-hour free reply window has closed for {customerName}. Open their profile to send an approved template.
      </div>
    );
  }

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
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2 border-t border-line bg-subtle/40 px-5 py-3">
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

      <div className="flex items-end gap-2">
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
          className="field min-h-11 flex-1 resize-none py-2 text-sm"
        />
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
  );
}
