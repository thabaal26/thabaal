"use server";

import { requireManager } from "@/lib/session";
import { revokeMediaToken, revokeTokensForImage } from "@/lib/media-token";
import type { ActionResult } from "./templates";

/**
 * Server action: Revokes a specific media capability token across all PM2 processes (F-01, F-02).
 */
export async function revokeMediaTokenAction(token: string, reason?: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!token || typeof token !== "string") return { ok: false, message: "Valid media token required." };

  const success = await revokeMediaToken(token, {
    clientId: s.clientId ?? null,
    reason: reason || "Manual revocation by manager",
  });

  return {
    ok: success,
    message: success ? "Media access token revoked permanently." : "Failed to revoke token.",
  };
}

/**
 * Server action: Revokes all capability tokens for a specific uploaded media asset (F-02).
 */
export async function revokeImageMediaAction(imageId: string, reason?: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!imageId || typeof imageId !== "string") return { ok: false, message: "Valid image ID required." };

  await revokeTokensForImage(imageId, {
    clientId: s.clientId ?? null,
    reason: reason || "Manual asset invalidation by manager",
  });

  return {
    ok: true,
    message: "All access tokens for this image have been revoked.",
  };
}
