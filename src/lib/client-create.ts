// A new business record: the checks and starting values shared by "Add a client" (actions/clients.ts) and
// "Make it a business" on a won enquiry (lib/leads.ts). Pure: the callers write it.

import { businessTypeOf } from "./business-types";
import { sanitizeDisabledSections } from "./client-sections";

/** A city name: letters, spaces, dots, apostrophes and hyphens (e.g. "Chennai", "Tiruchirappalli"). */
export const CITY =/^[\p{L}][\p{L} .'-]{1,39}$/u;

export function newClientData(input: { name: string; city?: string; businessType?: string; disabledSections?: string[] }) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Enter the client's business name." };
  const city = input.city?.trim().replace(/\s+/g, " ") ?? "";
  if (!city) return { ok: false as const, message: "Enter the city they deliver from, e.g. Chennai." };
  if (!CITY.test(city)) return { ok: false as const, message: "Enter just the city name, e.g. Chennai." };
  // The business type starts the client with the extra fields that kind of business usually keeps.
  const type = businessTypeOf(input.businessType);
  return {
    ok: true as const,
    name,
    data: {
      name,
      planRequired: true,
      disabledSections: sanitizeDisabledSections(input.disabledSections),
      homeCity: city,
      businessType: type?.id ?? null,
      ...(type?.starterFields.length && { customFields: type.starterFields }),
    },
  };
}
