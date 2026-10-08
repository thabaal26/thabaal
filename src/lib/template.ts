// Shared by server and client: template shapes, validation, rendering and Meta payloads.

export type Category = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type HeaderKind = "NONE" | "TEXT" | "IMAGE";

export type TemplateButton = {
  /** ORDER_DETAILS is WhatsApp's "Review and pay" button; such templates only go out as payment requests. */
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "ORDER_DETAILS";
  text: string;
  url?: string;
  phone?: string;
};

export type VarSource = { source: "name" | "first_name" | "phone" | "static"; value?: string };
export type VarMap = Record<string, VarSource>;

export type TemplateDraft = {
  name: string;
  language: string;
  category: Category;
  headerType: HeaderKind;
  headerText: string;
  headerMediaUrl: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  variables: VarMap;
  codeExpiryMins: number | null;
  securityNote: boolean;
  /** WhatsApp Business Account to create it in, when the client has several. */
  businessAccountId?: string | null;
};

export type CustomerLike = { name: string; phone: string };

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "ar", label: "Arabic" },
];

export const CATEGORY_INFO: Record<Category, { label: string; hint: string }> = {
  MARKETING: { label: "Marketing", hint: "Offers, launches, festive greetings and re-engagement." },
  UTILITY: { label: "Utility", hint: "Order updates, reminders, bookings and account alerts." },
  AUTHENTICATION: { label: "Authentication", hint: "One-time passcodes. Meta fixes the wording." },
};

export const SAMPLE_CUSTOMER: CustomerLike = { name: "Priya Sharma", phone: "919876543210" };

/** Placeholder numbers used in a string, e.g. "Hi {{1}}, {{2}}" → [1, 2]. */
export function placeholders(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

export function resolveVar(v: VarSource | undefined, c: CustomerLike) {
  switch (v?.source) {
    case "first_name":
      return c.name.trim().split(/\s+/)[0] || "there";
    case "phone":
      return `+${c.phone}`;
    case "static":
      return v.value?.trim() || "—";
    default:
      return c.name.trim() || "there";
  }
}

function fill(text: string, value: (n: number) => string) {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => value(Number(n)));
}

type Renderable = Pick<
  TemplateDraft,
  "category" | "headerType" | "headerText" | "body" | "footer" | "variables" | "codeExpiryMins" | "securityNote"
>;

/** Text a customer sees plus the parameter lists the Cloud API expects. */
export function renderFor(t: Renderable, c: CustomerLike, otp = "482913") {
  if (t.category === "AUTHENTICATION") {
    let body = `*${otp}* is your verification code.`;
    if (t.securityNote) body += " For your security, do not share this code.";
    const footer = t.codeExpiryMins ? `This code expires in ${t.codeExpiryMins} minutes.` : "";
    return { header: "", body, footer, bodyParams: [otp], headerParams: [] as string[] };
  }
  const nums = placeholders(t.body);
  const bodyParams = nums.map((n) => resolveVar(t.variables[String(n)], c));
  const headerParams =
    t.headerType === "TEXT" && placeholders(t.headerText).length ? [resolveVar(t.variables.h1, c)] : [];
  return {
    header: t.headerType === "TEXT" ? fill(t.headerText, () => headerParams[0] ?? "") : "",
    body: fill(t.body, (n) => bodyParams[nums.indexOf(n)] ?? ""),
    footer: t.footer,
    bodyParams,
    headerParams,
  };
}

/**
 * The same template as one plain WhatsApp message, for the local session provider,
 * which can't send Meta templates or real buttons.
 */
export function toPlainText(
  r: { header: string; body: string; footer: string },
  buttons: TemplateButton[] = [],
) {
  const parts = [r.header && `*${r.header}*`, r.body, r.footer && `_${r.footer}_`];
  const lines = buttons
    .map((b) =>
      b.type === "URL" ? `👉 ${b.text}: ${b.url}`
      : b.type === "PHONE_NUMBER" ? `📞 ${b.text}: ${b.phone}`
      : b.type === "QUICK_REPLY" ? `↩️ Reply "${b.text}"`
      : "",
    )
    .filter(Boolean);
  if (lines.length) parts.push(lines.join("\n"));
  return parts.filter(Boolean).join("\n\n");
}

export function validateDraft(t: TemplateDraft): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) errors.push("Name can only use lowercase letters, numbers and underscores.");
  if (t.category === "AUTHENTICATION") {
    if (t.codeExpiryMins != null && (t.codeExpiryMins < 1 || t.codeExpiryMins > 90))
      errors.push("Code expiry must be 1–90 minutes.");
    return errors;
  }
  const body = t.body.trim();
  if (!body) errors.push("Message body is required.");
  if (body.length > 1024) errors.push("Body must be 1024 characters or fewer.");
  const vars = placeholders(body);
  if (vars.some((n, i) => n !== i + 1)) errors.push("Body variables must be numbered in order: {{1}}, {{2}}, {{3}}…");
  if (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(body))
    errors.push("Meta rejects a body that starts or ends with a variable. Add some words around it.");
  if (t.headerType === "TEXT") {
    if (!t.headerText.trim()) errors.push("Header text is required.");
    if (t.headerText.length > 60) errors.push("Header must be 60 characters or fewer.");
    const hv = placeholders(t.headerText);
    if (hv.length > 1 || (hv.length && hv[0] !== 1)) errors.push("Header can have one variable, written {{1}}.");
  }
  if (t.headerType === "IMAGE" && !/^https:\/\/.+/.test(t.headerMediaUrl))
    errors.push("Header image needs a public https:// URL (JPG or PNG).");
  if (t.footer.length > 60) errors.push("Footer must be 60 characters or fewer.");
  if (t.buttons.length > 10) errors.push("A template can have at most 10 buttons.");
  t.buttons.forEach((b, i) => {
    if (!b.text.trim() || b.text.length > 25) errors.push(`Button ${i + 1}: label must be 1–25 characters.`);
    if (b.type === "URL" && !/^https?:\/\/.+/.test(b.url ?? "")) errors.push(`Button ${i + 1}: enter a full website URL.`);
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test((b.phone ?? "").replace(/\s/g, "")))
      errors.push(`Button ${i + 1}: enter a phone number with country code.`);
  });
  if (t.buttons.filter((b) => b.type === "URL").length > 2) errors.push("At most 2 website buttons.");
  if (t.buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) errors.push("At most 1 call button.");
  return errors;
}

/** Components for Meta's create/edit template endpoints. */
export function toMetaComponents(t: TemplateDraft, headerHandle?: string) {
  if (t.category === "AUTHENTICATION") {
    const c: Record<string, unknown>[] = [{ type: "BODY", add_security_recommendation: t.securityNote }];
    if (t.codeExpiryMins) c.push({ type: "FOOTER", code_expiration_minutes: t.codeExpiryMins });
    c.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: t.buttons[0]?.text || "Copy code" }] });
    return c;
  }
  const sample = renderFor(t, SAMPLE_CUSTOMER);
  const c: Record<string, unknown>[] = [];
  if (t.headerType === "TEXT") {
    c.push({
      type: "HEADER",
      format: "TEXT",
      text: t.headerText,
      ...(sample.headerParams.length ? { example: { header_text: sample.headerParams } } : {}),
    });
  } else if (t.headerType === "IMAGE" && headerHandle) {
    c.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } });
  }
  c.push({
    type: "BODY",
    text: t.body,
    ...(sample.bodyParams.length ? { example: { body_text: [sample.bodyParams] } } : {}),
  });
  if (t.footer.trim()) c.push({ type: "FOOTER", text: t.footer });
  if (t.buttons.length) {
    c.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text, url: b.url }
          : b.type === "PHONE_NUMBER"
            ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone?.replace(/\s/g, "") }
            : { type: "QUICK_REPLY", text: b.text },
      ),
    });
  }
  return c;
}

export type MetaComponent = {
  type: string;
  format?: string;
  text?: string;
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
  buttons?: { type: string; text?: string; url?: string; phone_number?: string }[];
};

/** Turns a template fetched from Meta into our editable shape. */
export function fromMetaComponents(components: MetaComponent[]) {
  const out = {
    headerType: "NONE" as HeaderKind,
    headerText: "",
    body: "",
    footer: "",
    buttons: [] as TemplateButton[],
    securityNote: false,
    codeExpiryMins: null as number | null,
  };
  for (const c of components) {
    if (c.type === "HEADER") {
      out.headerType = c.format === "TEXT" ? "TEXT" : c.format === "IMAGE" ? "IMAGE" : "NONE";
      out.headerText = c.text ?? "";
    } else if (c.type === "BODY") {
      out.body = c.text ?? "";
      out.securityNote = !!c.add_security_recommendation;
    } else if (c.type === "FOOTER") {
      out.footer = c.text ?? "";
      out.codeExpiryMins = c.code_expiration_minutes ?? null;
    } else if (c.type === "BUTTONS") {
      out.buttons = (c.buttons ?? []).map((b) => ({
        type:
          b.type === "URL" ? "URL"
          : b.type === "PHONE_NUMBER" ? "PHONE_NUMBER"
          : b.type === "OTP" ? "COPY_CODE"
          : b.type === "ORDER_DETAILS" ? "ORDER_DETAILS"
          : "QUICK_REPLY",
        text: b.text ?? "Copy code",
        url: b.url,
        phone: b.phone_number,
      }));
    }
  }
  return out;
}
