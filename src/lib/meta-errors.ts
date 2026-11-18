// Meta Cloud API error codes, in plain words, with what the portal does about each.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

export type ErrorScope =
  | "customer"
  | "recipient-pair"
  | "sender"
  | "waba"
  | "template"
  | "api"
  | "system";

export type TemporaryOrPermanent = "temporary" | "permanent";

export interface MetaErrorClassification {
  code: number;
  metaDescription: string;
  category: ErrorCategory;
  kind: ErrorKind;
  scope: ErrorScope;
  temporaryOrPermanent: TemporaryOrPermanent;
  customerFacingStatus: string;
  retryAllowed: boolean;
  retryCooldownRule: string;
  suppressRecipient: boolean;
  requiresOperatorAction: boolean;
  sourceRef: string;
  lastVerified: string;
}

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
  131021: { title: "Sender and recipient phone numbers are identical (cannot message own business WhatsApp number)", kind: "other" },
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

export const META_ERROR_CATALOG: Record<number, MetaErrorClassification> = {
  131026: {
    code: 131026,
    metaDescription: "Message Undeliverable: The recipient cannot receive WhatsApp messages, has an incompatible app version, or has blocked the sender number.",
    category: "permanent",
    kind: "unreachable",
    scope: "customer",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Cannot receive WhatsApp messages",
    retryAllowed: false,
    retryCooldownRule: "No retry permitted. Customer marked unreachable until phone number is re-verified or updated.",
    suppressRecipient: true,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131026",
    lastVerified: "2026-11",
  },
  131049: {
    code: 131049,
    metaDescription: "Marketing message limit reached: Meta held back delivery to this recipient to prevent fatigue / spam over-saturation.",
    category: "marketing",
    kind: "marketing-limit",
    scope: "recipient-pair",
    temporaryOrPermanent: "temporary",
    customerFacingStatus: "Temporarily held by Meta (Frequency fatigue)",
    retryAllowed: true,
    retryCooldownRule: "Cooldown minimum 24 hours. Campaigns skip for 3 days; manual operator retry allowed after 24h.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131049",
    lastVerified: "2026-11",
  },
  130472: {
    code: 130472,
    metaDescription: "User is part of an ongoing Meta marketing experiment preventing delivery of promotional content.",
    category: "marketing",
    kind: "experiment",
    scope: "recipient-pair",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Meta marketing test limitation",
    retryAllowed: false,
    retryCooldownRule: "Do not retry: Meta explicitly documents that resending will fail with the same error indefinitely.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 130472",
    lastVerified: "2026-11",
  },
  131050: {
    code: 131050,
    metaDescription: "User has opted out of marketing messages from this WhatsApp Business Account.",
    category: "opt-out",
    kind: "stopped-marketing",
    scope: "customer",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Opted out of marketing",
    retryAllowed: false,
    retryCooldownRule: "Never retry marketing broadcasts. Requires explicit affirmative customer opt-in to clear.",
    suppressRecipient: true,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131050",
    lastVerified: "2026-11",
  },
  131056: {
    code: 131056,
    metaDescription: "Pair rate limit exceeded: Too many messages sent to this recipient in a short time frame.",
    category: "rate",
    kind: "pair-rate",
    scope: "recipient-pair",
    temporaryOrPermanent: "temporary",
    customerFacingStatus: "Temporary recipient frequency limit",
    retryAllowed: true,
    retryCooldownRule: "Controlled exponential backoff: retry after 5 to 15 minutes.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131056",
    lastVerified: "2026-11",
  },
  130429: {
    code: 130429,
    metaDescription: "Cloud API rate limit hit: Sending throughput exceeds the registered tier capacity.",
    category: "rate",
    kind: "rate",
    scope: "sender",
    temporaryOrPermanent: "temporary",
    customerFacingStatus: "Sender throughput throttled",
    retryAllowed: true,
    retryCooldownRule: "Backoff schedule via throttleDelayMinutes (5, 10, 20... up to 120 mins). Customer is NOT invalid or dormant.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 130429",
    lastVerified: "2026-11",
  },
  80007: {
    code: 80007,
    metaDescription: "Account level rate limit: Meta API hourly or daily request quota reached.",
    category: "rate",
    kind: "rate",
    scope: "waba",
    temporaryOrPermanent: "temporary",
    customerFacingStatus: "Meta API account rate limit",
    retryAllowed: true,
    retryCooldownRule: "System throttles batch and delays next send. Customer is NOT invalid or dormant.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 80007",
    lastVerified: "2026-11",
  },
  190: {
    code: 190,
    metaDescription: "Access token has expired or been revoked.",
    category: "account",
    kind: "setup",
    scope: "system",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "System access token expired",
    retryAllowed: false,
    retryCooldownRule: "Pause campaign runs immediately until administrator updates token on Clients settings. Not a customer failure.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 190",
    lastVerified: "2026-11",
  },
  200: {
    code: 200,
    metaDescription: "Permissions error: Meta app does not have required permissions or scopes to send messages.",
    category: "account",
    kind: "setup",
    scope: "system",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "System permissions error",
    retryAllowed: false,
    retryCooldownRule: "Pause campaign runs until app permissions are restored in Meta App Dashboard.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 200",
    lastVerified: "2026-11",
  },
  131009: {
    code: 131009,
    metaDescription: "Parameter value invalid: Phone number format is invalid or malformed.",
    category: "permanent",
    kind: "other",
    scope: "customer",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Invalid phone number format",
    retryAllowed: false,
    retryCooldownRule: "Do not retry until customer phone number is corrected in database.",
    suppressRecipient: true,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131009",
    lastVerified: "2026-11",
  },
  131021: {
    code: 131021,
    metaDescription: "Sender and recipient phone numbers are identical: Meta Cloud API rejects messages where recipient phone number equals the business sending number.",
    category: "permanent",
    kind: "other",
    scope: "sender",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Sender and recipient phone numbers are identical",
    retryAllowed: false,
    retryCooldownRule: "Cannot message the business's own WhatsApp number. Do not retry until sender/recipient configuration is corrected. Do not suppress customer record.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131021",
    lastVerified: "2026-11",
  },
  130403: {
    code: 130403,
    metaDescription: "Customer is blocked in the WhatsApp Business Account.",
    category: "permanent",
    kind: "unreachable",
    scope: "customer",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Customer blocked in WhatsApp Business",
    retryAllowed: false,
    retryCooldownRule: "Do not retry. Customer cannot receive messages unless unblocked in Meta Business Manager.",
    suppressRecipient: true,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 130403",
    lastVerified: "2026-11",
  },
  132000: {
    code: 132000,
    metaDescription: "Template variable mismatch: Parameter count or positions do not match approved template specification.",
    category: "template",
    kind: "template",
    scope: "template",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Template variable mapping error",
    retryAllowed: false,
    retryCooldownRule: "Do not retry automatically. Fix variable mappings on Templates page, then resubmit.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 132000",
    lastVerified: "2026-11",
  },
  132001: {
    code: 132001,
    metaDescription: "Template does not exist: Template name or language code is not found or not approved on Meta WABA.",
    category: "template",
    kind: "template",
    scope: "template",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Template or language not found in Meta",
    retryAllowed: false,
    retryCooldownRule: "Do not retry automatically. Verify template name, status and language in WhatsApp Manager.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 132001",
    lastVerified: "2026-11",
  },
  131048: {
    code: 131048,
    metaDescription: "Sending phone number has been restricted by Meta due to policy violations, spam reports, or quality score dropping to RED.",
    category: "account",
    kind: "number-restricted",
    scope: "sender",
    temporaryOrPermanent: "permanent",
    customerFacingStatus: "Sender number restricted by Meta",
    retryAllowed: false,
    retryCooldownRule: "Campaigns pause immediately. Requires review of sender quality score and Meta Business Account health.",
    suppressRecipient: false,
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Codes: 131048",
    lastVerified: "2026-11",
  },
  133004: {
    code: 133004,
    metaDescription: "Server maintenance: WhatsApp backend servers are temporarily undergoing maintenance.",
    category: "temporary",
    kind: "temporary",
    scope: "system",
    temporaryOrPermanent: "temporary",
    customerFacingStatus: "WhatsApp servers in maintenance",
    retryAllowed: true,
    retryCooldownRule: "Temporary failure: retry on next scheduled batch tick in 5-10 minutes.",
    suppressRecipient: false,
    requiresOperatorAction: false,
    sourceRef: "Meta Graph API Cloud API Error Codes: 133004",
    lastVerified: "2026-11",
  },
};

export function getMetaErrorClassification(code: number | null | undefined): MetaErrorClassification {
  if (code == null) {
    return {
      code: 0,
      metaDescription: "Unknown error code",
      category: "permanent",
      kind: "other",
      scope: "system",
      temporaryOrPermanent: "permanent",
      customerFacingStatus: "Unknown error",
      retryAllowed: false,
      retryCooldownRule: "Never retry unknown errors automatically.",
      suppressRecipient: false,
      requiresOperatorAction: true,
      sourceRef: "Internal fallback",
      lastVerified: "2026-11",
    };
  }

  const found = META_ERROR_CATALOG[code];
  if (found) return found;

  const basic = metaError(code);
  const cat = basic?.kind ? CATEGORY[basic.kind] : "permanent";
  const kind = basic?.kind ?? "other";

  let scope: ErrorScope = "system";
  if (["unreachable", "stopped-marketing"].includes(kind)) scope = "customer";
  else if (["marketing-limit", "experiment", "pair-rate"].includes(kind)) scope = "recipient-pair";
  else if (["rate", "number-restricted"].includes(kind)) scope = "sender";
  else if (["template", "window"].includes(kind)) scope = "template";
  else if (["account", "setup"].includes(kind)) scope = "waba";

  return {
    code,
    metaDescription: basic?.title ?? `Meta Cloud API error code ${code}`,
    category: cat,
    kind,
    scope,
    temporaryOrPermanent: cat === "temporary" || cat === "rate" ? "temporary" : "permanent",
    customerFacingStatus: basic?.title ?? `Error (${code})`,
    retryAllowed: cat === "temporary" || (cat === "marketing" && code === 131049),
    retryCooldownRule: cat === "temporary" ? "Try on next batch" : "Not retryable",
    suppressRecipient: cat === "permanent" && kind === "unreachable",
    requiresOperatorAction: true,
    sourceRef: "Meta Graph API Cloud API Error Reference",
    lastVerified: "2026-11",
  };
}
