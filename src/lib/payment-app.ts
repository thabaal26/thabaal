// Which UPI app a payment was made with, for the order card. Shared by server and client code (no database here).
// Found in what the customer wrote ("paid by gpay"), a screenshot's caption, their UPI ID's handle (…@okaxis is Google
// Pay, …@ybl PhonePe), Meta's payment details, or picked by staff when recording the payment.

export const PAYMENT_APPS = {
  gpay: "GPay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  bhim: "BHIM",
  amazonpay: "Amazon Pay",
  cred: "CRED",
  whatsapp: "WhatsApp Pay",
  other: "Other UPI app",
} as const;

export type PaymentApp = keyof typeof PAYMENT_APPS;

export const isPaymentApp = (v: unknown): v is PaymentApp => typeof v === "string" && v in PAYMENT_APPS;
export const paymentAppName = (v: string | null | undefined) => (isPaymentApp(v) ? PAYMENT_APPS[v] : null);

// Names first (what the customer says), then UPI ID handles. Order matters: "whatsapp pay" before anything else.
const RULES: [RegExp, PaymentApp][] = [
  [/\bwhats\s?app\s?pay\b/i, "whatsapp"],
  [/\b(?:g\s?-?pay|google\s?pay|tez)\b|ஜி\s?பே|கூகுள்\s?பே/iu, "gpay"],
  [/\bphone\s?pe\b|போன்\s?பே/iu, "phonepe"],
  [/\bpaytm\b|பேடிஎம்/iu, "paytm"],
  [/\bbhim\b|பீம்/iu, "bhim"],
  [/\bamazon\s?pay\b/i, "amazonpay"],
  [/\bcred\b/i, "cred"],
  [/@ok(?:axis|hdfcbank|icici|sbi)\b/i, "gpay"],
  [/@(?:ybl|ibl|axl)\b/i, "phonepe"],
  [/@(?:paytm|pt(?:sbi|hdfc|yes|axis))\b/i, "paytm"],
  [/@(?:apl|yapl|rapl)\b/i, "amazonpay"],
  [/@axisb\b/i, "cred"],
  [/@upi\b/i, "bhim"],
];

/** The UPI app named in a message, caption or payment details, or null when none is clear. */
export function detectPaymentApp(text: string | null | undefined): PaymentApp | null {
  const t = text ?? "";
  if (!t.trim()) return null;
  for (const [re, app] of RULES) if (re.test(t)) return app;
  return null;
}

/** How a payment was confirmed (Order.paymentSource), in plain words. */
export const PAYMENT_SOURCE_WORDS: Record<string, string> = {
  meta: "WhatsApp payment",
  utr: "UPI ref from the customer",
  screenshot: "Customer's screenshot",
  staff: "Recorded by staff",
  verified: "Checked by staff",
};
