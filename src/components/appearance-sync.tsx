"use client";

import { useEffect } from "react";
import type { AppearanceDataset } from "@/lib/appearance";

/** Keeps <html data-iconset data-look …> on the portal's look when it changes without a full page
 *  load (an admin switching clients, or saving a new look). The first paint is handled by the
 *  layout's inline script; <html> carries the look so sheets and dialogs rendered at the end of
 *  <body> wear it too. */
export function AppearanceSync({ data }: { data: AppearanceDataset }) {
  const key = JSON.stringify(data);
  useEffect(() => {
    Object.assign(document.documentElement.dataset, JSON.parse(key) as AppearanceDataset);
  }, [key]);
  return null;
}
