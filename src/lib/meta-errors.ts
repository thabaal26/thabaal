// Meta Cloud API error codes, in plain words, with what the portal does about each.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

export type ErrorKind =
  | "unreachable" // this person can't get WhatsApp messages: skip them from now on
  | "stopped-marketing" // they turned off marketing from this business: opt them out
  | "marketing-limit" // Meta is holding back marketing to this person for now
  | "rate" // sending too fast: slow down and retry, the message isn't lost
  | "number-restricted" // the sending number is limited: pause the campaign
  | "window" // free-form text needs a reply from them in the last 24 h
  | "template" // the template is missing, paused or doesn't match
  | "test-list" // test numbers only reach the verified test recipients
  | "account" // payment or account problem on Meta's side
  | "other";

const ERRORS: Record<number, { title: string; kind: ErrorKind }> = {
  131026: { title: "Can't receive WhatsApp messages: not on WhatsApp, an old app version, or they blocked the number", kind: "unreachable" },
  131021: { title: "Recipient is the sending number itself", kind: "unreachable" },
  131050: { title: "Customer turned off marketing messages from this business", kind: "stopped-marketing" },
  131049: { title: "Meta held this marketing message back because the customer gets many; try again in a few days", kind: "marketing-limit" },
  130472: { title: "Customer is part of a Meta experiment that limits marketing messages", kind: "marketing-limit" },
  131056: { title: "Too many messages to this customer in a short time", kind: "rate" },
  130429: { title: "Sending faster than Meta allows for this number", kind: "rate" },
  80007: { title: "Meta API rate limit reached", kind: "rate" },
  131048: { title: "Number limited by Meta for spam: too many blocks or reports", kind: "number-restricted" },
  368: { title: "Number temporarily blocked by Meta for a policy issue", kind: "number-restricted" },
  131031: { title: "WhatsApp account locked by Meta", kind: "number-restricted" },
  131047: { title: "More than 24 hours since the customer last wrote; only templates can be sent", kind: "window" },
  132000: { title: "Template variables don't match what Meta approved", kind: "template" },
  132001: { title: "Template doesn't exist in this language on Meta", kind: "template" },
  132005: { title: "Template text too long after filling in variables", kind: "template" },
  132007: { title: "Template content breaks Meta policy", kind: "template" },
  132012: { title: "Template variable format doesn't match", kind: "template" },
  132015: { title: "Template paused by Meta for low quality", kind: "template" },
  132016: { title: "Template disabled by Meta", kind: "template" },
  131030: { title: "Not in the test number's recipient list; add it in Meta → API setup", kind: "test-list" },
  131042: { title: "Payment problem on the Meta account; add a payment method", kind: "account" },
  131045: { title: "Number isn't fully registered with Meta", kind: "account" },
  133010: { title: "Number isn't registered on the Cloud API", kind: "account" },
};

export function metaError(code: number | null | undefined) {
  return code != null ? ERRORS[code] : undefined;
}

/** What the log shows: the plain explanation, keeping Meta's own words when we don't know the code. */
export function explainError(code: number | null | undefined, raw: string | null | undefined) {
  const known = metaError(code);
  return known ? `${known.title} (${code})` : (raw ?? "Failed");
}
