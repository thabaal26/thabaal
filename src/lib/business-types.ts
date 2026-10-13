/*
 * The kind of business a client runs. It picks sensible portal sections and starter custom fields
 * when the client is added; both can be changed afterwards.
 */

import type { ClientPlanPreset } from "./client-sections";
import type { CustomField } from "./custom-fields";

export type BusinessTypeId = "retail" | "restaurant" | "service" | "wholesale" | "other";

export type BusinessType = {
  id: BusinessTypeId;
  label: string;
  description: string;
  /** Portal sections to start with (lib/client-sections.ts presets). */
  preset: ClientPlanPreset["id"];
  /** Extra fields most businesses of this kind keep. */
  starterFields: CustomField[];
};

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: "retail",
    label: "Shop / online store",
    description: "Sells products: catalogue, carts, orders, delivery and payments.",
    preset: "full",
    starterFields: [{ key: "birthday", label: "Birthday", type: "date", on: "customer" }],
  },
  {
    id: "restaurant",
    label: "Restaurant / food",
    description: "Menu orders, delivery or pickup, and offers.",
    preset: "full",
    starterFields: [
      { key: "food_preference", label: "Food preference", type: "select", options: ["Veg", "Non-veg", "Vegan"], on: "customer" },
      { key: "order_type", label: "Order type", type: "select", options: ["Delivery", "Pickup", "Dine-in"], on: "order" },
    ],
  },
  {
    id: "service",
    label: "Clinic / salon / service",
    description: "Customers book visits or services; reminders and follow-ups.",
    preset: "templates_campaigns",
    starterFields: [
      { key: "preferred_time", label: "Preferred time", type: "text", on: "customer" },
      { key: "last_visit", label: "Last visit", type: "date", on: "customer" },
    ],
  },
  {
    id: "wholesale",
    label: "Wholesale / distributor",
    description: "Bulk orders from shops and resellers, credit and dues.",
    preset: "orders_desk",
    starterFields: [
      { key: "gstin", label: "GSTIN", type: "text", on: "customer" },
      { key: "credit_days", label: "Credit days", type: "number", on: "customer" },
      { key: "po_number", label: "PO number", type: "text", on: "order" },
    ],
  },
  {
    id: "other",
    label: "Other",
    description: "Anything else; pick sections and fields yourself.",
    preset: "full",
    starterFields: [],
  },
] as const;

export const businessTypeOf = (id: string | null | undefined) => BUSINESS_TYPES.find((b) => b.id === id) ?? null;
