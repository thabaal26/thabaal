/** A photo, voice note, video or file a customer sent, loaded through /api/media. */
export function ReplyMedia({ id, type }: { id: string; type: string | null }) {
  const src = `/api/media/${id}`;
  if (type === "image" || type === "sticker")
    return (
      <a href={src} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- streamed from Meta, not optimisable */}
        <img src={src} alt="Photo from the customer" loading="lazy" className="max-h-64 max-w-full rounded-control ring-1 ring-line" />
      </a>
    );
  if (type === "audio") return <audio controls preload="none" src={src} className="mt-2 w-full max-w-xs" />;
  if (type === "video") return <video controls preload="none" src={src} className="mt-2 max-h-64 max-w-full rounded-control" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-deep underline sm:min-h-0">
      Open file
    </a>
  );
}
