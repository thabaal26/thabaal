import type { Tone } from "@/components/ui";

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
  /** Points from confirmed order spend (1 pt per ₹10 spent) */
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
  /** Redeemable ₹ voucher right now (rounded to nearest ₹25 for clean offers, min ₹25 if >=50 pts) */
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
  //    - 1 pt per ₹10 spent on confirmed WhatsApp orders (5% value back in points)
  //    - +50 pts per repeat WhatsApp order (2nd order onwards)
  //    - +35 pts per historical sheet purchase item
  //    - + manual bonus / minus redeemed points
  const spendPoints = Math.floor(spent / 10);
  const frequencyPoints = Math.max(0, paidOrders - 1) * 50;
  const sheetPoints = sheetItemsCount * 35;
  const manualPoints = parseManualLoyaltyPoints(input.tags);
  const totalPoints = Math.max(0, spendPoints + frequencyPoints + sheetPoints + manualPoints);

  // 2. Rupee conversion: 100 pts = ₹50 reward credit (1 pt = ₹0.50)
  const rewardRupees = Math.round(totalPoints * 0.5);
  const redeemableRupees =
    totalPoints >= 100
      ? Math.min(250, Math.floor(rewardRupees / 25) * 25)
      : totalPoints >= 50
        ? 30
        : 25;

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

  // 6. Smart Offer Suggestion tailored to this customer's exact buying & cart behavior
  const firstName = input.name.trim().split(/\s+/)[0] || "there";
  const brand = input.brandName || "our store";
  const fav = input.favoriteProduct || "your favourite essentials";
  const dropped = input.droppedProduct;

  let offerBadge = "Loyalty Perk";
  let offerHeadline = "";
  let offerReason = "";
  let whatsappOfferCopy = "";

  if ((input.unpaidCartValue ?? 0) > 0) {
    const discount = Math.max(30, Math.min(100, redeemableRupees));
    offerBadge = `Instant Cart Saver · ₹${discount} off`;
    offerHeadline = `Apply ₹${discount} loyalty credit (${totalPoints} pts) to close their open ₹${Math.round(input.unpaidCartValue!)} unpaid cart today`;
    offerReason = `Customer has an active unpaid cart right now. Letting them redeem ₹${discount} from their loyalty balance removes checkout hesitation immediately.`;
    whatsappOfferCopy = `Hi ${firstName}! You have ${totalPoints || 60} loyalty points with ${brand}. Complete your open WhatsApp cart today and enjoy ₹${discount} instant loyalty discount + priority dispatch!`;
  } else if (dropped) {
    const comboOff = Math.max(40, Math.min(100, redeemableRupees));
    offerBadge = `Dropped-Item Offer · ₹${comboOff} off`;
    offerHeadline = `Offer ₹${comboOff} off (or ${Math.max(80, totalPoints)} loyalty pts) to add back "${dropped}" on their next order`;
    offerReason = `They previously added "${dropped}" to cart and removed it before paying. A targeted combo/loyalty discount converts price hesitation into a larger basket.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! We noticed you checked out ${dropped} earlier. Use your ${totalPoints || 80} loyalty points at ${brand} to get ₹${comboOff} off when you include ${dropped} in your next order!`;
  } else if (rfmSegment === "Big Spender · At Risk") {
    const winbackCredit = Math.max(75, redeemableRupees);
    offerBadge = `VIP Win-Back · ₹${winbackCredit} off`;
    offerHeadline = `High-spend customer cooling down (RFM ${rfmCode}) — send ₹${winbackCredit} VIP win-back credit on ${fav}`;
    offerReason = `High Monetary/Frequency score (M:${mScore}, F:${fScore}) but low Recency (R:${rScore}). Losing a top spender hurts revenue most — intervene with a VIP voucher now.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! We miss serving you at ${brand}. You have ${totalPoints} VIP loyalty points (worth ₹${winbackCredit} off) waiting! Tap below to restock fresh ${fav} with free priority delivery.`;
  } else if (tier === "platinum" || (paidOrders >= 3 && spent >= 1500)) {
    const vipCredit = Math.max(75, redeemableRupees);
    offerBadge = `VIP Reward · ₹${vipCredit} credit`;
    offerHeadline = `Reward with ₹${vipCredit} VIP loyalty voucher (${totalPoints} pts) + free sample of a new/slow-moving item with ${fav}`;
    offerReason = `Top frequent buyer (${paidOrders} paid orders · ₹${Math.round(spent).toLocaleString("en-IN")} spent · RFM ${rfmCode}). VIP perks lock in retention and help introduce new catalogue items.`;
    whatsappOfferCopy = `Vanakkam ${firstName}! Thank you for being a ${tierLabel} customer at ${brand} (${totalPoints} loyalty pts earned!). Enjoy ₹${vipCredit} off + a complimentary trial pack on your next order of ${fav}.`;
  } else if (isFrequentBuyer && days !== null && days >= 25) {
    offerBadge = `Reorder Due · ₹${redeemableRupees} off + 2× pts`;
    offerHeadline = `Due for reorder (${days}d since last order) — offer ₹${redeemableRupees} loyalty credit on ${fav}`;
    offerReason = `Repeat buyer whose usual reorder window (~${input.avgGapDays ?? 30}d) is open now. Reaching out with their earned points prevents switching to local stores.`;
    whatsappOfferCopy = `Hi ${firstName}, running low on ${fav}? You have ${totalPoints} loyalty points (worth ₹${rewardRupees}) waiting at ${brand}! Place your reorder this week to redeem ₹${redeemableRupees} off + earn 2× bonus points.`;
  } else if (paidOrders >= 1 || sheetItemsCount >= 1) {
    const voucher = Math.max(40, redeemableRupees);
    offerBadge = `Repeat Booster · ₹${voucher} off`;
    offerHeadline = `Convert into a frequent buyer: offer ₹${voucher} loyalty discount (${totalPoints} pts) on their next order of ${fav}`;
    offerReason = `Has ordered before (${paidOrders ? `${paidOrders} WhatsApp order${paidOrders === 1 ? "" : "s"}` : "past sheet buyer"}). The 2nd order is the biggest milestone for long-term retention.`;
    whatsappOfferCopy = `Hi ${firstName}! You've earned ${totalPoints} loyalty points from your purchase at ${brand}. Redeem ₹${voucher} off on your next WhatsApp order of ${fav} this week!`;
  } else {
    offerBadge = "1st-Order Welcome · +50 pts";
    offerHeadline = "Send a First-Order Free Delivery + 50 Bonus Loyalty Points welcome offer";
    offerReason = "Has not placed their first WhatsApp order yet. A welcome loyalty bonus + free delivery lowers first-order friction.";
    whatsappOfferCopy = `Vanakkam ${firstName}! Welcome to ${brand}. Place your first WhatsApp catalogue order this week to get FREE doorstep delivery + 50 Bonus Loyalty Points (₹25 credit)!`;
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
