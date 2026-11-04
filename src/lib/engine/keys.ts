// Button keys and actions for automatic replies (lib/engine), shared by the server and the dashboard. A template's
// quick-reply button is known by a stable key, so the business's saved action decides what a tap does, never the
// label text alone; the same label can do different things for different businesses.
import type { TemplateButton } from "../template";

/** Our quick-reply payloads: "tb:<key>". Keys stay short because Meta doesn't document the payload limit. */
export const PAYLOAD_PREFIX = "tb:";
export const MAX_KEY = 32;

/** A button's key: set on the button, else its label in lowercase-dashes ("View Products" → "view-products"). */
export function buttonKeyOf(b: Pick<TemplateButton, "text"> & { key?: string }) {
  const raw = (b.key?.trim() || b.text || "").toLowerCase();
  const key = [...raw.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")].slice(0, MAX_KEY).join("");
  return key || "button";
}

/** The template's quick-reply buttons with their keys and positions (Meta numbers buttons from 0 in template order). */
export function quickReplies(buttons: unknown): { index: number; text: string; key: string }[] {
  return ((Array.isArray(buttons) ? buttons : []) as (TemplateButton & { key?: string })[])
    .map((b, index) => ({ b, index }))
    .filter(({ b }) => b?.type === "QUICK_REPLY" && typeof b.text === "string")
    .map(({ b, index }) => ({ index, text: b.text, key: buttonKeyOf(b) }));
}

export const ACTIONS = ["reply", "handoff", "tag", "opt_out", "builtin"] as const;
export type ActionKind = (typeof ACTIONS)[number];
export const BUILTINS = ["catalogue", "reorder"] as const;

/** What the business picks for a button, in plain words (the Templates page). */
export const ACTION_LABEL: Record<ActionKind, { en: string; hint: string }> = {
  reply: { en: "Send a reply", hint: "Answer with your own message" },
  handoff: { en: "Hand over to staff", hint: "Pause automatic replies; your team answers in Chats" },
  tag: { en: "Add a tag", hint: "Tag the customer (for campaigns and lists), with an optional reply" },
  opt_out: { en: "Stop messages", hint: "Stop offers only, or all messages" },
  builtin: { en: "Built-in reply", hint: "Send your catalogue, or offer their last order again" },
};

/** Fills {name} (first name) and {shop} in a business's reply text. */
export function fillReply(text: string, vars: { name: string; shop: string }) {
  return text.replace(/\{name\}/gi, vars.name).replace(/\{shop\}/gi, vars.shop).trim();
}

export type ButtonActionInput = { action: ActionKind; value?: string | null; replyText?: string | null; enabled?: boolean };

/** Checks what a business saves for a button; returns the cleaned action or an error for the owner. */
export function cleanAction(a: ButtonActionInput): { ok: true; value: Required<ButtonActionInput> } | { ok: false; error: string } {
  if (!ACTIONS.includes(a.action)) return { ok: false, error: "Pick what the button should do." };
  const value = (a.value ?? "").trim();
  const replyText = (a.replyText ?? "").trim().slice(0, 1000);
  if (a.action === "reply" && !value) return { ok: false, error: "Write the reply to send." };
  if (a.action === "reply" && value.length > 1000) return { ok: false, error: "Keep the reply under 1,000 characters." };
  if (a.action === "tag" && !/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(value)) return { ok: false, error: "Use a short tag (letters, numbers, - or _)." };
  if (a.action === "opt_out" && !["offers", "all"].includes(value)) return { ok: false, error: "Choose: stop offers only, or all messages." };
  if (a.action === "builtin" && !(BUILTINS as readonly string[]).includes(value)) return { ok: false, error: "Choose a built-in reply." };
  return { ok: true, value: { action: a.action, value: a.action === "tag" ? value.toLowerCase() : value || null, replyText: replyText || null, enabled: a.enabled !== false } };
}
