"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

/**
 * A photo, voice note, video or file a customer sent, loaded through /api/media.
 * WhatsApp only keeps media for a while; once it's gone this says so instead of a broken image.
 */
export function ReplyMedia({ id, type }: { id: string; type: string | null }) {
  const [gone, setGone] = useState(false);
  const src = `/api/media/${id}`;
  if (gone)
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-control bg-sunken px-2.5 py-1.5 text-xs text-muted">
        <ImageOff aria-hidden className="size-3.5" /> {type === "audio" ? "Voice note" : type === "video" ? "Video" : "Photo"} no longer available from WhatsApp
      </p>
    );
  if (type === "image" || type === "sticker")
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed from Meta, not optimisable */}
        <img src={src} alt="Photo from the customer" loading="lazy" onError={() => setGone(true)} className="max-h-64 max-w-full rounded-control ring-1 ring-line" />
      </a>
    );
  if (type === "audio") return <audio controls preload="none" src={src} onError={() => setGone(true)} className="mt-2 w-full max-w-xs" />;
  if (type === "video") return <video controls preload="none" src={src} onError={() => setGone(true)} className="mt-2 max-h-64 max-w-full rounded-control" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-deep underline sm:min-h-0">
      Open file
    </a>
  );
}
