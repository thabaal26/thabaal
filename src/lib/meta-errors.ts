// Meta Cloud API error codes, in plain words, with what the portal does about each.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

export type ErrorKind =
  | "unreachable" // this person can't get WhatsApp messages: skip them from now on
  | "stopped-marketing" // they turned off marketing from this business: opt them out
  | "marketing-limit" // Meta is holding back marketing to this person for now
  | "experiment" // Meta's marketing experiment: no offers reach them at all, resending gets the same error
  | "rate" // sending too fast: slow down and retry, the message isn't lost
  | "pair-rate" // too many messages to this one person just now: others can still be sent; this one later
  | "temporary" // Meta is briefly unavailable: try again in a few minutes, the message isn't lost
  | "number-restricted" // the sending number is limited: pause the campaign
  | "setup" // the access token or app permissions don't work: pause until an admin fixes them
  | "account" // payment, registration or account problem on Meta's side: pause until fixed
  | "window" // free-form text needs a reply from them in the last 24 h
  | "template" // the template is missing, paused or doesn't match
  | "test-list" // test numbers only reach the verified test recipients
  | "other";

/** Kinds that stop every message from this number, so a campaign pauses instead of failing its whole audience. */
export const PAUSING_KINDS: ErrorKind[] = ["setup", "account"];

/** Not the customer's fault: an automatic message hit by one of these is tried again on a later scheduler run. */
export const TRY_LATER_KINDS: ErrorKind[] = ["rate", "pair-rate", "temporary", "setup", "account", "number-restricted"];

const ERRORS: Record<number, { title: string; kind: ErrorKind }> = {
  // Ours, not Meta's (lib/whatsapp NOT_CONNECTED_CODE): the client has no WhatsApp number of its own yet.
  990001: { title: "This business hasn't connected its own WhatsApp number yet", kind: "setup" },
  // The customer
  131026: { title: "Can't receive WhatsApp messages: not on WhatsApp, an old app version, or they blocked the number", kind: "unreachable" },
  131021: { title: "Recipient is the sending number itself", kind: "unreachable" },
  130403: { title: "This customer is blocked in your WhatsApp Business account", kind: "unreachable" },
  131050: { title: "Customer turned off marketing messages from this business", kind: "stopped-marketing" },
  131049: { title: "Meta held this offer back because the customer gets many; it can be sent again after 24 hours", kind: "marketing-limit" },
  130472: { title: "Customer is in a Meta test that stops offers reaching them; sending again won't work", kind: "experiment" },

  // Speed and Meta's availability
  131056: { title: "Too many messages to this customer in a short time; others can still be sent, this one later", kind: "pair-rate" },
  130429: { title: "Sending faster than Meta allows for this number", kind: "rate" },
  80007: { title: "Meta API rate limit reached", kind: "rate" },
  4: { title: "Too many requests to Meta from this app; slowing down", kind: "rate" },
  1: { title: "Meta couldn't handle the request just now", kind: "temporary" },
  2: { title: "Meta is temporarily unavailable", kind: "temporary" },
  131016: { title: "WhatsApp service is temporarily unavailable", kind: "temporary" },
  131057: { title: "WhatsApp Business account is in maintenance mode for a while", kind: "temporary" },
  133004: { title: "WhatsApp servers are in maintenance", kind: "temporary" },

  // The sending number
  131048: { title: "Number limited by Meta for spam: too many blocks or reports", kind: "number-restricted" },
  368: { title: "Number temporarily blocked by Meta for a policy issue", kind: "number-restricted" },
  131031: { title: "WhatsApp account locked by Meta", kind: "number-restricted" },
  130497: { title: "This WhatsApp account isn't allowed to message customers in this country", kind: "number-restricted" },

  // Access token and app permissions (fixed by an admin on the Clients page or in Meta)
  0: { title: "Meta couldn't sign in with the access token; replace it on the Clients page", kind: "setup" },
  3: { title: "The Meta app isn't allowed to send messages; check its permissions in Meta", kind: "setup" },
  10: { title: "A permission the Meta app needs is missing or was removed", kind: "setup" },
  190: { title: "The access token has expired; paste a new one on the Clients page", kind: "setup" },
  200: { title: "No valid access token; paste one on the Clients page", kind: "setup" },
  131005: { title: "The access token doesn't have permission to send; check it in Meta", kind: "setup" },

  // The WhatsApp account (fixed in Meta Business settings / WhatsApp Manager)
  33: { title: "This WhatsApp number was deleted in Meta", kind: "account" },
  131037: { title: "The number's display name isn't approved by Meta yet", kind: "account" },
  131042: { title: "Payment problem on the Meta account; add a payment method", kind: "account" },
  131045: { title: "Number isn't fully registered with Meta", kind: "account" },
  131063: { title: "Marketing templates are turned off for this account in Meta", kind: "account" },
  133000: { title: "A previous attempt to remove this number from WhatsApp didn't finish", kind: "account" },
  133005: { title: "Wrong two-step verification PIN for this number", kind: "account" },
  133006: { title: "The number must be verified before it can be registered", kind: "account" },
  133008: { title: "Too many wrong PIN attempts; try again later", kind: "account" },
  133009: { title: "PIN entered too quickly; try again later", kind: "account" },
  133010: { title: "Number isn't registered on the Cloud API", kind: "account" },
  133015: { title: "This number was deleted recently; wait before registering it again", kind: "account" },
  133016: { title: "Too many registration attempts for this number; wait and try again", kind: "account" },
  134011: { title: "WhatsApp Payments terms haven't been accepted yet", kind: "account" },

  // The message or template
  131047: { title: "More than 24 hours since the customer last wrote; only templates can be sent", kind: "window" },
  132000: { title: "Template variables don't match what Meta approved", kind: "template" },
  132001: { title: "Template doesn't exist in this language on Meta", kind: "template" },
  132005: { title: "Template text too long after filling in variables", kind: "template" },
  132007: { title: "Template content breaks Meta policy", kind: "template" },
  132012: { title: "Template variable format doesn't match", kind: "template" },
  132015: { title: "Template paused by Meta for low quality", kind: "template" },
  132016: { title: "Template disabled by Meta", kind: "template" },
  132068: { title: "The WhatsApp Flow in this message is blocked", kind: "template" },
  132069: { title: "Too many WhatsApp Flow messages in the last hour", kind: "template" },
  131053: { title: "Meta couldn't upload the message's image or file; check the header image link", kind: "template" },
  131051: { title: "WhatsApp doesn't support this type of message", kind: "other" },
  131008: { title: "A required part of the message is missing", kind: "other" },
  131009: { title: "Part of the message isn't valid, often the phone number format", kind: "other" },
  100: { title: "Meta rejected a field in the request", kind: "other" },
  135000: { title: "Meta rejected the request for an unknown reason", kind: "other" },
  131000: { title: "Meta couldn't send this message for an unknown reason", kind: "other" },
  131030: { title: "Not in the test number's recipient list; add it in Meta → API setup", kind: "test-list" },
};

export function metaError(code: number | null | undefined) {
  if (code == null) return undefined;
  // 200–299 are all permission problems with the app or token.
  return ERRORS[code] ?? (code >= 200 && code <= 299 ? { title: "The Meta app is missing a permission it needs; check the app and token in Meta", kind: "setup" as const } : undefined);
}

/**
 * What a failure means for sending again, by category (codes checked against Meta's error-code page, Nov 2026):
 *  permanent  – this person can't get WhatsApp from you (131026…): never retried; campaigns leave them out.
 *  temporary  – Meta briefly unavailable: the message stays queued and is tried on the next batch.
 *  marketing  – Meta is holding offers back from this person (131049; 130472 has no end): campaigns skip them
 *               SKIP_DAYS; one retry after at least 24 h is the business's choice, never automatic (lib/held.ts),
 *               and Meta may hold it again (24 h is a minimum, not a promise).
 *  opt-out    – they stopped your marketing (131050): suppressed (Customer.optedOut), never retried.
 *  template   – the template or its values are wrong (132000/132001…) or the 24 h window is closed (131047: send a
 *               template): fixed by the business, then sent again; never retried as it is.
 *  account    – token, payment, registration or a restricted number (131031, 131048…): the run pauses until fixed.
 *  rate       – throughput (130429/80007/4): the batch waits longer each time (throttleDelayMinutes); 131056 is per
 *               person: that message fails without charge, the rest of the batch goes on.
 * A retry never bypasses opt-out, "can't receive" or Meta's holds: every send re-checks them.
 */
export type ErrorCategory = "permanent" | "temporary" | "marketing" | "opt-out" | "template" | "account" | "rate";

const CATEGORY: Record<ErrorKind, ErrorCategory> = {
  unreachable: "permanent",
  "stopped-marketing": "opt-out",
  "marketing-limit": "marketing",
  experiment: "marketing",
  rate: "rate",
  "pair-rate": "rate",
  temporary: "temporary",
  "number-restricted": "account",
  setup: "account",
  account: "account",
  window: "template",
  template: "template",
  "test-list": "account",
  other: "permanent",
};

export const CATEGORY_INFO: Record<ErrorCategory, { label: string; retry: string }> = {
  permanent: { label: "Can't be delivered", retry: "Not sent again: it would fail the same way." },
  temporary: { label: "Meta briefly unavailable", retry: "Tried again automatically on the next batch." },
  marketing: { label: "Held back by Meta", retry: "Skipped for 3 days; you can send once more after 24 hours. Meta may hold it again." },
  "opt-out": { label: "Opted out of offers", retry: "Never sent offers again unless they opt back in." },
  template: { label: "Template problem", retry: "Fix the template (or use a template), then send again." },
  account: { label: "WhatsApp account problem", retry: "The campaign waits until the account or number is fixed." },
  rate: { label: "Sending too fast", retry: "Waits longer each time, then goes on by itself." },
};

/** The category of a Meta error code; unknown codes are treated as permanent so nothing retries blindly. */
export function errorCategory(code: number | null | undefined): ErrorCategory {
  const kind = metaError(code)?.kind;
  return kind ? CATEGORY[kind] : "permanent";
}

/** Exponential backoff after `n` throttled batches in a row: 5, 10, 20, 40, 80 minutes, then every 2 hours at most. */
export function throttleDelayMinutes(n: number) {
  return Math.min(120, 5 * 2 ** Math.max(0, n - 1));
}

/** Every listed code of these kinds (for database lookups; 200–299 are matched separately). */
export function codesOf(kinds: ErrorKind[]) {
  return Object.entries(ERRORS)
    .filter(([, e]) => kinds.includes(e.kind))
    .map(([code]) => Number(code));
}

/** What the log shows: the plain explanation, keeping Meta's own words when we don't know the code. */
export function explainError(code: number | null | undefined, raw: string | null | undefined) {
  const known = metaError(code);
  return known ? `${known.title} (${code})` : (raw ?? "Failed");
}
