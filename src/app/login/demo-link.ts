/** Where "Book a demo" goes: the sales WhatsApp chat, else a sales email, else the sign-in card. */
const WA = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
const MAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "";

export const DEMO_URL = WA
  ? `https://wa.me/${WA}?text=${encodeURIComponent("Hi Thabaal, I'd like a demo for my business.")}`
  : MAIL
    ? `mailto:${MAIL}?subject=${encodeURIComponent("Thabaal demo")}`
    : "#top";

/** Opens WhatsApp in a new tab; email and the in-page fallback stay in the same tab. */
export const DEMO_TARGET = DEMO_URL.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {};
