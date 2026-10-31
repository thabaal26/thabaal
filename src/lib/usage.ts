import "server-only";

// Counting what business logins do (lib/usage-record.ts), from server actions and the page-open beacon.

import { after } from "next/server";
import { sessionUser } from "./session";
import { recordUsage, type PRESSES } from "./usage-record";

/**
 * Counts one press of an action for the Usage page, after the response has gone (never slows or breaks the
 * action). Call it from a server action, with a key listed in PRESSES.
 */
export function trackPress(key: keyof typeof PRESSES) {
  try {
    after(async () => {
      await recordUsage(await sessionUser().catch(() => null), "press", key);
    });
  } catch {
    // Outside a request (tests): nothing to count.
  }
}
