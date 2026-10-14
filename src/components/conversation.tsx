"use client";

import { useEffect, useRef } from "react";
import { Check, CheckCheck, CircleAlert, Clock, FileText } from "@/components/icons";
import { ReplyMedia } from "@/components/reply-media";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";

export type ConversationEntry =
  | { at: Date; type: "out"; id: string; template: string; campaign: string | null; status: string; body: string | null; readAt: Date | null; error: string | null; via: string | null }
  | { at: Date; type: "in"; id: string; text: string; kind: string; mediaId: string | null; mediaType: string | null; via: string | null };

/** Extracts an optional `[Media: https://...]` attachment tag from an outbound message body. */
function parseOutboundBody(body: string | null): { text: string; mediaUrl: string | null } {
  if (!body) return { text: "", mediaUrl: null };
  const match = body.match(/\[Media:\s*(https?:\/\/[^\]\s]+)\]/i);
  if (!match) return { text: body, mediaUrl: null };
  const text = body.replace(match[0], "").trim();
  return { text, mediaUrl: match[1] };
}

/** WhatsApp-style ticks for an outgoing message, always with words for screen readers. */
function Ticks({ status }: { status: string }) {
  const label = { QUEUED: "Queued", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed", SKIPPED: "Skipped" }[status] ?? status;
  const icon =
    status === "READ" ? (
      <CheckCheck aria-hidden className="size-3.5 text-[#53BDEB]" />
    ) : status === "DELIVERED" ? (
      <CheckCheck aria-hidden className="size-3.5 text-[#667781] dark:text-[#8696A0]" />
    ) : status === "SENT" ? (
      <Check aria-hidden className="size-3.5 text-[#667781] dark:text-[#8696A0]" />
    ) : status === "FAILED" ? (
      <CircleAlert aria-hidden className="size-3.5 text-danger" />
    ) : (
      <Clock aria-hidden className="size-3 text-[#667781] dark:text-[#8696A0]" />
    );
  return (
    <span className={cn("inline-flex items-center gap-1", status === "FAILED" && "font-medium text-danger")}>
      {icon}
      <span className={status === "FAILED" || status === "SKIPPED" || status === "QUEUED" ? "" : "sr-only"}>{label}</span>
    </span>
  );
}

/**
 * A customer's messages and replies as a chat: oldest at the top, newest at the bottom,
 * with native, smooth, responsive scrolling that auto-anchors to the latest message.
 */
export function Conversation({ entries, className }: { entries: ConversationEntry[]; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Oldest → newest with day dividers
  const ordered = [...entries].reverse();
  const dayOf = (e: ConversationEntry) => fmtDate(e.at, "yyyy-MM-dd");
  const rows = ordered.flatMap((e, i) => {
    const day = dayOf(e);
    const divider = i === 0 || dayOf(ordered[i - 1]) !== day ? [{ divider: fmtDate(e.at, "EEE d MMM yyyy"), key: `d-${day}` }] : [];
    return [...divider, { entry: e, key: e.id }];
  });

  // Automatically scroll to the latest message at bottom on initial load and whenever entries update
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length, entries[0]?.id]);

  return (
    <div
      ref={scrollRef}
      className={cn("chat-wall panel-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain", className)}
      tabIndex={0}
      aria-label="Conversation"
    >
      <ol className="min-h-full w-full space-y-2.5 p-3.5 sm:p-5 flex flex-col justify-end">
        {rows.map((r) =>
          "divider" in r ? (
            <li key={r.key} className="flex justify-center py-1">
              <span className="rounded-lg bg-white/90 dark:bg-[#182229]/90 px-3 py-1 text-[11px] font-semibold text-[#54656F] dark:text-[#8696A0] shadow-2xs border border-black/[0.04] dark:border-white/[0.05]">{r.divider}</span>
            </li>
          ) : r.entry.type === "in" ? (
            <li key={r.key} className="flex">
              <div className="max-w-[min(82%,32rem)] rounded-[16px] rounded-tl-xs bg-white dark:bg-[#202C33] px-3.5 py-2 text-[14px] text-[#111B21] dark:text-[#E9EDEF] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] border border-black/[0.04] dark:border-white/[0.04]">
                {r.entry.kind === "button" && <p className="mb-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Tapped a button</p>}
                {r.entry.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">{r.entry.text}</p>}
                {r.entry.mediaId && <ReplyMedia id={r.entry.id} type={r.entry.mediaType} />}
                <p className="tabular mt-1 text-right text-[11px] text-[#667781] dark:text-[#8696A0]">
                  {r.entry.via && `to ${r.entry.via} · `}
                  <time dateTime={r.entry.at.toISOString()}>{fmtDate(r.entry.at, "h:mm a")}</time>
                </p>
              </div>
            </li>
          ) : (
            <li key={r.key} className="flex justify-end">
              <div className={cn("max-w-[min(82%,32rem)] rounded-[16px] rounded-tr-xs px-3.5 py-2 text-[14px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]", r.entry.status === "FAILED" ? "bg-danger-bg ring-1 ring-danger-border text-ink" : "bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] border border-[#C5F3BC] dark:border-[#025142]")}>
                <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-[#54656F] dark:text-[#8696A0]">
                  <span className="font-mono">{r.entry.template}</span>
                  {r.entry.campaign && <span>· {r.entry.campaign}</span>}
                </p>
                {(() => {
                  const { text, mediaUrl } = parseOutboundBody(r.entry.body);
                  const isPdf = mediaUrl ? /\.pdf(\?|$)/i.test(mediaUrl) : false;
                  return (
                    <>
                      {mediaUrl && (
                        isPdf ? (
                          <a
                            href={mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-1.5 flex items-center gap-2 rounded-control border border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/10 px-3 py-2 text-xs font-medium text-brand-deep hover:underline"
                          >
                            <FileText aria-hidden className="size-4 shrink-0" />
                            <span className="truncate">Open PDF attachment</span>
                          </a>
                        ) : (
                          <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-1.5 block overflow-hidden rounded-control border border-black/10">
                            {/* eslint-disable-next-line @next/next/no-img-element -- outbound attachment preview */}
                            <img src={mediaUrl} alt="Sent attachment" className="max-h-56 w-auto object-cover" />
                          </a>
                        )
                      )}
                      {text && <p className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">{text}</p>}
                    </>
                  );
                })()}
                {r.entry.error && <p className="mt-1 text-xs text-danger">{r.entry.error}</p>}
                <p className="tabular mt-1 flex flex-wrap items-center justify-end gap-1.5 text-[11px] text-[#667781] dark:text-[#8696A0]">
                  {r.entry.via && <span>from {r.entry.via} ·</span>}
                  <time dateTime={r.entry.at.toISOString()}>{fmtDate(r.entry.at, "h:mm a")}</time>
                  <Ticks status={r.entry.status} />
                </p>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
