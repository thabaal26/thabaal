import type { Tone } from "@/components/ui";
import { isSale, type SaleFields } from "./sale";

export type LoyaltyTier = "platinum" | "gold" | "silver" | "bronze";

export type RfmSegment =
  | "Champion (5·5·5)"
  | "Loyal Regular"
  | "Big Spender · At Risk"
  | "Promising Repeat"
  | "New First-Timer"
  | "Reorder Window"
  | "Hibernating Past Buyer"
  | "Warm Cart Lead"
  | "Cold Prospect";

export type CustomerLoyaltySummary = {
  /** Points from confirmed order spend (1 pt per ₹100 spent) */
  spendPoints: number;
  /** Bonus points from order frequency (+50 pts for every repeat order after the 1st) */
  frequencyPoints: number;
  /** Bonus points from historical order-sheet purchases (+35 pts per recorded sheet item) */
  sheetPoints: number;
  /** Manual bonus or redeemed points set by admin via loyalty-bonus:<N> tag */
  manualPoints: number;
  /** Total available loyalty points (minimum 0) */
  totalPoints: number;
  /** Equivalent ₹ discount value (100 pts = ₹50, i.e. ₹0.50 per point) */
  rewardRupees: number;
  /** ₹ the customer can use as a discount now: balance in ₹25 steps, max ₹250, 0 below 50 points */
  redeemableRupees: number;
  /** Tier classification */
  tier: LoyaltyTier;
  tierLabel: string;
  tierTone: Tone;
  /** Progress to next tier (0–100) and points needed */
  nextTierLabel: string | null;
  pointsToNextTier: number;
  progressPct: number;
  /** RFM (Recency, Frequency, Monetary) 1-5 scores & composite ratio */
  rScore: number; // 1–5 Recency
  fScore: number; // 1–5 Frequency
  mScore: number; // 1–5 Monetary
  rfmCode: string; // e.g. "5-4-5"
  rfmRatioPct: number; // e.g. 93% (out of 15 max points)
  rfmSegment: RfmSegment;
  rfmTone: Tone;
  /** Buyer classification flags */
  isFrequentBuyer: boolean;
  isTopCustomer: boolean;
  /** Data-driven smart offer recommendation */
  offerBadge: string;
  offerHeadline: string;
  offerReason: string;
  whatsappOfferCopy: string;
};

const BONUS_TAG_PREFIX = "loyalty-bonus:";

/** Rupees a customer spends to earn 1 loyalty point. */
export const RUPEES_PER_POINT = 100;

/** Reads manual bonus/redeemed points stored in Customer.tags (e.g. "loyalty-bonus:150" or "loyalty-bonus:-100"). */
export function parseManualLoyaltyPoints(tags: string[] | null | undefined): number {
  if (!tags?.length) return 0;
  let sum = 0;
  for (const t of tags) {
    const lower = t.trim().toLowerCase();
    if (lower.startsWith(BONUS_TAG_PREFIX)) {
      const n = Number(lower.slice(BONUS_TAG_PREFIX.length));
      if (Number.isFinite(n)) sum += Math.round(n);
    }
  }
  return sum;
}

/** Updates the tags array with a new manual loyalty point adjustment. */
export function applyManualLoyaltyDelta(tags: string[], delta: number, totalAfter?: number): string[] {
  const current = parseManualLoyaltyPoints(tags);
  const nextManual = current + Math.round(delta);
  const cleaned = tags.filter((t) => !t.trim().toLowerCase().startsWith(BONUS_TAG_PREFIX));
  if (nextManual !== 0) {
    cleaned.push(`${BONUS_TAG_PREFIX}${nextManual}`);
  }
  if (totalAfter !== undefined && totalAfter >= 250 && !cleaned.includes("vip")) {
    cleaned.push("vip");
  }
  return cleaned;
}

type LoyaltyOrderRow = { id?: string; total: number; status: string; paidAt: Date | null; paymentMethod: string | null; internalNote: string | null; pointsRedeemed?: number | null };

/** Bought = paid, or confirmed and beyond: the orders that earn points. */
export const isBoughtOrder = (o: SaleFields) => isSale(o);

/** Points used on orders that still stand; a cancelled order gives its points back. */
export const redeemedOnOrders = (orders: LoyaltyOrderRow[], exceptOrderId?: string) =>
  orders.reduce((n, o) => n + (o.status !== "CANCELLED" && o.id !== exceptOrderId ? Math.max(0, o.pointsRedeemed ?? 0) : 0), 0);

/**
 * A customer's loyalty from their order rows (any status), sheet purchases and tags: the one way every screen
 * and action works out the balance. `exceptOrderId` leaves that order's own points out, to re-price it.
 */
export function loyaltyFromOrders(
  c: { name: string; purchases?: string | null; tags?: string[] | null; orders: LoyaltyOrderRow[] },
  extra: Omit<Parameters<typeof computeCustomerLoyalty>[0], "name" | "paidOrdersCount" | "totalSpent" | "sheetPurchases" | "tags" | "redeemedPoints"> & { exceptOrderId?: string } = {},
) {
  const { exceptOrderId, ...rest } = extra;
  const bought = c.orders.filter((o) => isBoughtOrder(o) && o.id !== exceptOrderId);
  return computeCustomerLoyalty({
    ...rest,
    name: c.name,
    paidOrdersCount: bought.length,
    totalSpent: bought.reduce((n, o) => n + o.total, 0),
    sheetPurchases: c.purchases,
    tags: c.tags,
    redeemedPoints: redeemedOnOrders(c.orders, exceptOrderId),
  });
}

/** Strips internal loyalty-bonus tags from display tag lists so UI badges stay clean. */
export function isInternalLoyaltyTag(tag: string): boolean {
  return tag.trim().toLowerCase().startsWith(BONUS_TAG_PREFIX);
}

/**
 * Computes a customer's RFM (Recency, Frequency, Monetary) Ratio, Loyalty Points, Tier,
 * Frequent/Top status, and Smart Offer Suggestion from their actual order history, spend,
 * cart drop-offs, and sheet purchases.
 */
export function computeCustomerLoyalty(input: {
  name: string;
  brandName?: string;
  paidOrdersCount: number;
  totalSpent: number;
  sheetPurchases?: string | null;
  tags?: string[] | null;
  favoriteProduct?: string | null;
  droppedProduct?: string | null;
  unpaidCartValue?: number;
  daysSinceLastOrder?: number | null;
  avgGapDays?: number | null;
  /** Points already used on orders that aren't cancelled (Order.pointsRedeemed). */
  redeemedPoints?: number;
}): CustomerLoyaltySummary {
  const paidOrders = Math.max(0, Math.round(input.paidOrdersCount || 0));
  const spent = Math.max(0, Number(input.totalSpent) || 0);
  const sheetItemsCount = input.sheetPurchases
    ? input.sheetPurchases
        .split(/[,/;&+]+/)
        .map((s) => s.trim())
        .filter(Boolean).length
    : 0;

  // 1. Points formula:
  //    - 1 pt per ₹100 spent on confirmed WhatsApp orders (the client's rule)
  //    - +50 pts per repeat WhatsApp order (2nd order onwards)
  //    - +35 pts per historical sheet purchase item
  //    - + manual bonus / minus points redeemed by hand (tags) and on orders (Order.pointsRedeemed)
  const spendPoints = Math.floor(spent / RUPEES_PER_POINT);
  const frequencyPoints = Math.max(0, paidOrders - 1) * 50;
  const sheetPoints = sheetItemsCount * 35;
  const manualPoints = parseManualLoyaltyPoints(input.tags) - Math.max(0, Math.round(input.redeemedPoints ?? 0));
  const totalPoints = Math.max(0, spendPoints + frequencyPoints + sheetPoints + manualPoints);

  // 2. Rupee conversion: 100 pts = ₹50 reward credit (1 pt = ₹0.50)
  const rewardRupees = Math.round(totalPoints * 0.5);
  // What can be offered as a discount right now: the balance in steps of ₹25, at most ₹250,
  // and nothing below 50 points. Never more than the customer actually has.
  const redeemableRupees = totalPoints >= 50 ? Math.min(250, Math.floor(rewardRupees / 25) * 25) : 0;

  // 3. RFM (Recency, Frequency, Monetary) 1–5 Scoring
  const days = input.daysSinceLastOrder ?? null;
  const rScore =
    days !== null
      ? days <= 15
        ? 5
        : days <= 30
          ? 4
          : days <= 60
            ? 3
            : days <= 90
              ? 2
              : 1
      : sheetItemsCount > 0
        ? 2
        : 1;

  const fScore =
    paidOrders >= 4
      ? 5
      : paidOrders === 3
        ? 4
        : paidOrders === 2 || sheetItemsCount >= 3
          ? 3
          : paidOrders === 1 || sheetItemsCount >= 1
            ? 2
            : 1;

  const mScore =
    spent >= 2500
      ? 5
      : spent >= 1500
        ? 4
        : spent >= 800 || sheetItemsCount >= 2
          ? 3
          : spent >= 250 || sheetItemsCount >= 1
            ? 2
            : 1;

  const rfmCode = `${rScore}-${fScore}-${mScore}`;
  const rfmRatioPct = Math.round(((rScore + fScore + mScore) / 15) * 100);

  let rfmSegment: RfmSegment = "Cold Prospect";
  let rfmTone: Tone = "gray";
  if (rScore >= 4 && fScore >= 4 && mScore >= 4) {
    rfmSegment = "Champion (5·5·5)";
    rfmTone = "gold";
  } else if (fScore >= 3 && mScore >= 3 && rScore >= 3) {
    rfmSegment = "Loyal Regular";
    rfmTone = "green";
  } else if ((fScore >= 3 || mScore >= 4) && rScore <= 2) {
    rfmSegment = "Big Spender · At Risk";
    rfmTone = "red";
  } else if (rScore >= 4 && fScore >= 3) {
    rfmSegment = "Promising Repeat";
    rfmTone = "green";
  } else if (rScore === 3 && fScore >= 2) {
    rfmSegment = "Reorder Window";
    rfmTone = "blue";
  } else if (rScore >= 4 && fScore === 2) {
    rfmSegment = "New First-Timer";
    rfmTone = "blue";
  } else if (fScore >= 2 && rScore <= 2) {
    rfmSegment = "Hibernating Past Buyer";
    rfmTone = "amber";
  } else if ((input.unpaidCartValue ?? 0) > 0 || input.droppedProduct) {
    rfmSegment = "Warm Cart Lead";
    rfmTone = "amber";
  }

  // 4. Frequent Buyer & Top Customer flags
  const effectiveOrders = paidOrders + (paidOrders === 0 && sheetItemsCount >= 2 ? 2 : sheetItemsCount > 0 ? 1 : 0);
  const isFrequentBuyer = paidOrders >= 2 || effectiveOrders >= 2;
  const isTopCustomer = spent >= 1200 || paidOrders >= 3 || totalPoints >= 250;

  // 5. Tier calculation
  let tier: LoyaltyTier = "bronze";
  let tierLabel = "Bronze Starter";
  let tierTone: Tone = "gray";
  let nextTierLabel: string | null = "Silver Member";
  let pointsToNextTier = Math.max(0, 100 - totalPoints);
  let progressPct = Math.min(100, Math.round((totalPoints / 100) * 100));

  if (totalPoints >= 500 || paidOrders >= 4 || spent >= 3000) {
    tier = "platinum";
    tierLabel = "Platinum VIP";
    tierTone = "gold";
    nextTierLabel = null;
    pointsToNextTier = 0;
    progressPct = 100;
  } else if (totalPoints >= 250 || paidOrders >= 2 || spent >= 1500) {
    tier = "gold";
    tierLabel = "Gold Regular";
    tierTone = "green";
    nextTierLabel = "Platinum VIP";
    pointsToNextTier = Math.max(0, 500 - totalPoints);
    progressPct = Math.min(99, Math.round((totalPoints / 500) * 100));
  } else if (totalPoints >= 100 || paidOrders >= 1 || sheetItemsCount >= 1) {
    tier = "silver";
    tierLabel = "Silver Member";
    tierTone = "blue";
    nextTierLabel = "Gold Regular";
    pointsToNextTier = Math.max(0, 250 - totalPoints);
    progressPct = Math.min(99, Math.round((totalPoints / 250) * 100));
  }

  // 6. Suggested offer for this customer, from their real orders, carts and points.
  // Messages only mention points and discounts the customer really has (redeemableRupees), and never
  // promise things the portal doesn't do (free delivery, double points, free samples).
  const firstName = input.name.trim().split(/\s+/)[0] || "there";
  const brand = input.brandName || "our store";
  const fav = input.favoriteProduct || "your usual items";
  const dropped = input.droppedProduct;
  const credit = redeemableRupees;
  const pointsLine = totalPoints > 0 ? ` You have ${totalPoints} loyalty points with ${brand}.` : "";
  const creditLine = credit > 0 ? ` You can use ₹${credit} of them as a discount.` : "";

  let offerBadge = "Loyalty Perk";
  let offerHeadline = "";
  let offerReason = "";
  let whatsappOfferCopy = "";

  if ((input.unpaidCartValue ?? 0) > 0) {
    const cart = Math.round(input.unpaidCartValue!);
    offerBadge = credit > 0 ? `Cart Saver · ₹${credit} off` : "Cart Reminder";
    offerHeadline = credit > 0
      ? `Let them use ₹${credit} of their points (${totalPoints} pts) on the ₹${cart} unpaid cart`
      : `Remind them about the ₹${cart} unpaid cart`;
    offerReason = "They have an unpaid cart right now. A reminder, with their own points as a discount if they have enough, removes the last bit of hesitation.";
    whatsappOfferCopy = `Hi ${firstName}! Your ${brand} cart of ₹${cart} is still waiting.${pointsLine}${creditLine} Reply here and we'll confirm it for you.`;
  } else if (dropped) {
    offerBadge = credit > 0 ? `Dropped Item · ₹${credit} off` : "Dropped Item";
    offerHeadline = credit > 0
      ? `Offer ₹${credit} off from their points if they add "${dropped}" back`
      : `Remind them about "${dropped}", which they removed from a cart`;
    offerReason = `They added "${dropped}" to a cart and removed it before paying, usually price or pack size. A nudge, with their points as a discount if they have enough, can bring it back.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! You looked at ${dropped} at ${brand} earlier.${pointsLine}${creditLine} Shall we add it to your next order?`;
  } else if (rfmSegment === "Big Spender · At Risk") {
    offerBadge = credit > 0 ? `Win-Back · ₹${credit} off` : "Win-Back";
    offerHeadline = `A good customer who hasn't ordered for a while (RFM ${rfmCode})${credit > 0 ? `: offer ₹${credit} from their points` : ""}`;
    offerReason = `High spend or order count (M:${mScore}, F:${fScore}) but no recent order (R:${rScore}). These customers are worth the most to win back.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! We miss you at ${brand}.${pointsLine}${creditLine} Shall we send your usual ${fav}?`;
  } else if (tier === "platinum" || (paidOrders >= 3 && spent >= 1500)) {
    offerBadge = credit > 0 ? `VIP Thank You · ₹${credit} off` : "VIP Thank You";
    offerHeadline = `Thank a top customer${credit > 0 ? ` and let them use ₹${credit} of their ${totalPoints} points` : ""}`;
    offerReason = `One of the best customers (${paidOrders} paid orders · ₹${Math.round(spent).toLocaleString("en-IN")} spent · RFM ${rfmCode}). A thank-you keeps them coming back.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! Thank you for being a ${tierLabel} customer at ${brand}.${pointsLine}${creditLine} Your next ${fav} is ready whenever you are.`;
  } else if (isFrequentBuyer && days !== null && days >= 25) {
    offerBadge = credit > 0 ? `Reorder Due · ₹${credit} off` : "Reorder Due";
    offerHeadline = `Due for a reorder (${days} days since the last order)${credit > 0 ? `: offer ₹${credit} from their points` : ""}`;
    offerReason = `A repeat buyer whose usual gap (~${input.avgGapDays ?? 30} days) has passed. Reaching out now stops them buying elsewhere.`;
    whatsappOfferCopy = `Hi ${firstName}, running low on ${fav}?${pointsLine}${creditLine} Reply to reorder this week.`;
  } else if (paidOrders >= 1 || sheetItemsCount >= 1) {
    offerBadge = credit > 0 ? `Second Order · ₹${credit} off` : "Second Order";
    offerHeadline = `Turn them into a repeat buyer${credit > 0 ? ` with ₹${credit} off from their points` : ""}`;
    offerReason = `Has bought before (${paidOrders ? `${paidOrders} WhatsApp order${paidOrders === 1 ? "" : "s"}` : "past sheet buyer"}). The second order is the biggest step to a regular customer.`;
    whatsappOfferCopy = `Hi ${firstName}! Thank you for buying from ${brand}.${pointsLine}${creditLine} Reply to order your ${fav} again.`;
  } else {
    offerBadge = "First Order";
    offerHeadline = "Invite them to place their first WhatsApp order";
    offerReason = `Hasn't ordered on WhatsApp yet. Every order earns points (1 point per ₹${RUPEES_PER_POINT}), so tell them about it.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! Welcome to ${brand}. Order on WhatsApp and earn loyalty points on every order: 1 point for every ₹${RUPEES_PER_POINT}, and 100 points = ₹50 off.`;
  }

  return {
    spendPoints,
    frequencyPoints,
    sheetPoints,
    manualPoints,
    totalPoints,
    rewardRupees,
    redeemableRupees,
    tier,
    tierLabel,
    tierTone,
    nextTierLabel,
    pointsToNextTier,
    progressPct,
    rScore,
    fScore,
    mScore,
    rfmCode,
    rfmRatioPct,
    rfmSegment,
    rfmTone,
    isFrequentBuyer,
    isTopCustomer,
    offerBadge,
    offerHeadline,
    offerReason,
    whatsappOfferCopy,
  };
}
