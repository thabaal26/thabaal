"use client";

import { useEffect } from "react";
import type { IconLook, IconPack } from "@/lib/icon-pack";

/** Keeps <html data-icons data-look> on the client's choice when it changes without a full page
 *  load (an admin switching clients). The first paint is handled by the layout's inline script. */
export function IconPackSync({ pack, look }: { pack: IconPack; look: IconLook }) {
  useEffect(() => {
    document.documentElement.dataset.icons = pack;
    document.documentElement.dataset.look = look;
  }, [pack, look]);
  return null;
}
