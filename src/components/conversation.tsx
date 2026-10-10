import { Check, CheckCheck, CircleAlert, Clock } from "lucide-react";
import { ReplyMedia } from "@/components/reply-media";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";

export type ConversationEntry =
  | { at: Date; type: "out"; id: string; template: string; campaign: string | null; status: string; body: string | null; readAt: Date | null; error: string | null; via: string | null }
  | { at: Date; type: "in"; id: string; text: string; kind: string; mediaId: string | null; mediaType: string | null; via: string | null };

/** WhatsApp-style ticks for an outgoing message, always with words for screen readers. */
function Ticks({ status }: { status: string }) {
  const label = { QUEUED: "Queued", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed", SKIPPED: "Skipped" }[status] ?? status;
  const icon =
    status === "READ" ? (
      <CheckCheck aria-hidden className="size-3.5 text-wa-tick" />
    ) : status === "DELIVERED" ? (
      <CheckCheck aria-hidden className="size-3.5" />
    ) : status === "SENT" ? (
      <Check aria-hidden className="size-3.5" />
    ) : status === "FAILED" ? (
      <CircleAlert aria-hidden className="size-3.5 text-danger" />
    ) : (
      <Clock aria-hidden className="size-3" />
    );
  return (
    <span className={cn("inline-flex items-center gap-1", status === "FAILED" && "font-medium text-danger")}>
      {icon}
      <span className={status === "FAILED" || status === "SKIPPED" || status === "QUEUED" ? "" : "sr-only"}>{label}</span>
    </span>
  );
}

/**
 * A customer's messages and replies as a chat: oldest at the top, newest at the bottom, and the
 * scroll pane opens at the newest message (column-reverse) without any script.
 * `entries` come newest first, as the queries return them.
 */
export function Conversation({ entries, className }: { entries: ConversationEntry[]; className?: string }) {
  // Oldest → newest with day dividers; the reversed pane only anchors the scroll at the bottom.
  const ordered = [...entries].reverse();
  const dayOf = (e: ConversationEntry) => fmtDate(e.at, "yyyy-MM-dd");
  const rows = ordered.flatMap((e, i) => {
    const day = dayOf(e);
    const divider = i === 0 || dayOf(ordered[i - 1]) !== day ? [{ divider: fmtDate(e.at, "EEE d MMM yyyy"), key: `d-${day}` }] : [];
    return [...divider, { entry: e, key: e.id }];
  });

  return (
    <div className={cn("chat-wall flex flex-col-reverse overflow-y-auto overscroll-contain thin-scroll", className)} tabIndex={0} aria-label="Conversation">
      <ol className="space-y-2 p-3 sm:p-4">
        {rows.map((r) =>
          "divider" in r ? (
            <li key={r.key} className="flex justify-center py-1">
              <span className="rounded-full bg-panel/90 px-2.5 py-0.5 text-2xs font-medium text-muted shadow-xs">{r.divider}</span>
            </li>
          ) : r.entry.type === "in" ? (
            <li key={r.key} className="flex">
              <div className="max-w-[min(85%,34rem)] rounded-card rounded-tl-sm bg-bubble px-3 py-2 text-sm text-ink shadow-xs">
                {r.entry.kind === "button" && <p className="mb-0.5 text-xs font-medium text-brand-deep">Tapped a button</p>}
                {r.entry.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.entry.text}</p>}
                {r.entry.mediaId && <ReplyMedia id={r.entry.id} type={r.entry.mediaType} />}
                <p className="tabular mt-1 text-right text-2xs text-muted">
                  {r.entry.via && `to ${r.entry.via} · `}
                  <time dateTime={r.entry.at.toISOString()}>{fmtDate(r.entry.at, "h:mm a")}</time>
                </p>
              </div>
            </li>
          ) : (
            <li key={r.key} className="flex justify-end">
              <div className={cn("max-w-[min(85%,34rem)] rounded-card rounded-tr-sm px-3 py-2 text-sm text-ink shadow-xs", r.entry.status === "FAILED" ? "bg-danger-bg ring-1 ring-danger-border" : "bg-bubble-out")}>
                <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
                  <span className="font-mono">{r.entry.template}</span>
                  {r.entry.campaign && <span className="text-muted">· {r.entry.campaign}</span>}
                </p>
                {r.entry.body && <p className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{r.entry.body}</p>}
                {r.entry.error && <p className="mt-1 text-xs text-danger">{r.entry.error}</p>}
                <p className="tabular mt-1 flex flex-wrap items-center justify-end gap-1.5 text-2xs text-muted">
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
