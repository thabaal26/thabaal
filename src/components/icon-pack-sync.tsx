"use client";

import { useEffect } from "react";
import type { IconPack } from "@/lib/icon-pack";

/** Keeps <html data-icons> on the client's pack when it changes without a full page load
 *  (an admin switching clients). The first paint is handled by the layout's inline script. */
export function IconPackSync({ pack }: { pack: IconPack }) {
  useEffect(() => {
    document.documentElement.dataset.icons = pack;
  }, [pack]);
  return null;
}
