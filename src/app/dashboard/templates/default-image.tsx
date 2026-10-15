"use client";

import { ImageIcon, Upload } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toastResult } from "@/components/toast";
import { buttonClass, Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { setDefaultImage } from "../actions/templates";

/** One picture for every image template that hasn't got its own, so none of them fail for lack of an image. */
export function DefaultImage({ url, fallback }: { url: string | null; fallback: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const shown = url ?? fallback;

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toastResult({ ok: false, message: "That image is over 4 MB." });
    setBusy(true);
    try {
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Server returned ${res.status}`);
      toastResult(await setDefaultImage(data.url));
      router.refresh();
    } catch (e) {
      toastResult({ ok: false, message: `Upload failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-3d">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control bg-sunken ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- any uploaded or branding image */}
          {shown ? <img src={shown} alt="Default image" width={64} height={64} className="size-full object-cover" /> : <ImageIcon aria-label="No default image" className="size-5 text-muted" />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-ink">Default image</p>
          <p className="mt-0.5 text-xs text-muted">
            {url
              ? "Sent with every image template that has no picture of its own."
              : fallback
                ? "Using your brand banner for image templates without a picture. Upload a square or wide JPG/PNG to use something else."
                : "Image templates without their own picture fail until you set one. Upload a JPG or PNG."}
          </p>
        </div>
        <label className={cn(buttonClass("secondary"), "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-deep", busy && "pointer-events-none opacity-60")}>
          {busy ? <Spinner /> : <Upload aria-hidden className="size-4" />}
          {url ? "Replace" : "Upload default image"}
          <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
    </Card>
  );
}
