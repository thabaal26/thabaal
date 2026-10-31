import "server-only";

// The plan prices in force now (lib/plan-prices.ts), read from the database once per request.

import { cache } from "react";
import { db } from "./db";
import { DEFAULT_PRICES, plansWith, readPrices, type PriceTable } from "./plan-prices";

/** Prices for anything that charges or records money. A database error is thrown, never guessed around. */
export const loadPlanPrices = cache(async (): Promise<PriceTable> => {
  const s = await db.setting.findUnique({ where: { id: 1 }, select: { planPrices: true } });
  return readPrices(s?.planPrices);
});

/** Prices for display only (the public website): the list in the code if the database can't be read. */
export async function displayPlanPrices(): Promise<PriceTable> {
  return loadPlanPrices().catch((e) => {
    console.error("plan prices", e);
    return DEFAULT_PRICES;
  });
}

/** The plan list (names, limits, features) with the prices in force now. */
export async function livePlans() {
  return plansWith(await loadPlanPrices());
}
