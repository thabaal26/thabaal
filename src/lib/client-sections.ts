export type ClientSectionId =
  | "orders"
  | "catalogue"
  | "replies"
  | "calls"
  | "notifications"
  | "campaigns"
  | "templates"
  | "customers"
  | "messages";

export type ClientSectionMeta = {
  id: ClientSectionId;
  label: string;
  href: string;
  group: "Daily work" | "Marketing";
  description: string;
};

export const CLIENT_SECTIONS: readonly ClientSectionMeta[] = [
  {
    id: "orders",
    label: "Orders & dispatch",
    href: "/dashboard/orders",
    group: "Daily work",
    description: "Order tracking, packing slips, UPI payment requests, shipping & sales figures",
  },
  {
    id: "catalogue",
    label: "Catalogue & price list",
    href: "/dashboard/catalogue",
    group: "Daily work",
    description: "Product menu, pricing & WhatsApp catalogue sharing",
  },
  {
    id: "replies",
    label: "Customer replies",
    href: "/dashboard/replies",
    group: "Daily work",
    description: "Two-way inbox for incoming customer WhatsApp messages & quick actions",
  },
  {
    id: "calls",
    label: "WhatsApp calls",
    href: "/dashboard/calls",
    group: "Daily work",
    description: "Incoming & outgoing WhatsApp voice calls and live browser call widget",
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/dashboard/notifications",
    group: "Daily work",
    description: "Live alert feed, notification bell & browser tab badge",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    href: "/dashboard/campaigns",
    group: "Marketing",
    description: "Scheduled & bulk broadcast campaigns to customer segments",
  },
  {
    id: "templates",
    label: "Templates",
    href: "/dashboard/templates",
    group: "Marketing",
    description: "Meta template builder, approval sync & direct template sends",
  },
  {
    id: "customers",
    label: "Customers & audiences",
    href: "/dashboard/customers",
    group: "Marketing",
    description: "Customer directory, tags, Google Sheet import & QR lead growth",
  },
  {
    id: "messages",
    label: "Message log",
    href: "/dashboard/messages",
    group: "Marketing",
    description: "Delivery receipts, read rates, failure diagnostics & Meta spend",
  },
] as const;

export const VALID_SECTION_IDS = new Set<string>(CLIENT_SECTIONS.map((s) => s.id));

export type ClientPlanPreset = {
  id: "full" | "templates_campaigns" | "templates_only" | "orders_desk";
  label: string;
  badge: string;
  description: string;
  disabledSections: ClientSectionId[];
};

export const CLIENT_PLAN_PRESETS: readonly ClientPlanPreset[] = [
  {
    id: "full",
    label: "Full Commerce & Marketing",
    badge: "All sections",
    description: "Every feature enabled: Orders, Catalogue, Calls, Replies, Campaigns, Templates & Customers.",
    disabledSections: [],
  },
  {
    id: "templates_campaigns",
    label: "Templates & Campaigns (No Orders)",
    badge: "Marketing plan",
    description: "Hides Orders, Catalogue & Calls. Built for clients who only send WhatsApp templates & campaigns.",
    disabledSections: ["orders", "catalogue", "calls"],
  },
  {
    id: "templates_only",
    label: "Templates Only (Minimal)",
    badge: "Templates plan",
    description: "Only Dashboard, Templates, Customers & Message Log. Ideal for simple template or utility senders.",
    disabledSections: ["orders", "catalogue", "calls", "campaigns", "replies"],
  },
  {
    id: "orders_desk",
    label: "Orders & Support Desk",
    badge: "Order desk",
    description: "Orders, Catalogue, Replies, Calls, Templates & Customers without bulk marketing campaigns.",
    disabledSections: ["campaigns"],
  },
] as const;

export function sanitizeDisabledSections(raw: readonly string[] | null | undefined): ClientSectionId[] {
  if (!raw || !Array.isArray(raw)) return [];
  const unique = new Set<ClientSectionId>();
  for (const item of raw) {
    if (typeof item === "string" && VALID_SECTION_IDS.has(item)) {
      unique.add(item as ClientSectionId);
    }
  }
  return [...unique];
}

export function isSectionEnabled(
  disabledSections: readonly string[] | null | undefined,
  section: ClientSectionId,
): boolean {
  if (!disabledSections?.length) return true;
  return !disabledSections.includes(section);
}

export function sectionForHref(href: string): ClientSectionId | null {
  // The refill calendar is built from orders, so it follows the orders section.
  if (href === "/dashboard/refills" || href.startsWith("/dashboard/refills/")) return "orders";
  for (const s of CLIENT_SECTIONS) {
    if (href === s.href || href.startsWith(`${s.href}/`)) {
      return s.id;
    }
  }
  return null;
}

export function isHrefEnabled(
  href: string,
  disabledSections: readonly string[] | null | undefined,
): boolean {
  const sec = sectionForHref(href);
  if (!sec) return true; // /dashboard, /dashboard/settings, /dashboard/clients are always enabled
  return isSectionEnabled(disabledSections, sec);
}

export function detectPlanPreset(
  disabledSections: readonly string[] | null | undefined,
): ClientPlanPreset["id"] | "custom" {
  const current = new Set(sanitizeDisabledSections(disabledSections));
  for (const preset of CLIENT_PLAN_PRESETS) {
    if (
      preset.disabledSections.length === current.size &&
      preset.disabledSections.every((id) => current.has(id))
    ) {
      return preset.id;
    }
  }
  return "custom";
}
