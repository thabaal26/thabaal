import { regionInCity, usesMaduraiRules } from "./regions";

export type ParsedAddress = {
  /** Cleaned full street/delivery address. */
  fullAddress: string;
  /** Detected locality / area name (e.g. "Anna Nagar", "KK Nagar", "Sellur", "Chennai"). */
  area: string | null;
  /** Region bucket used by Customer filters, relative to the client's home city ("Madurai city" | "Outside Madurai" | "Not sure"). */
  region: string;
  /** 6-digit Indian pincode if present. */
  pincode: string | null;
  /** Whether this text looks like a real delivery address rather than a casual chat message. */
  isLikelyAddress: boolean;
  /** Confidence score (0..100) for sorting multiple chat messages. */
  confidence: number;
};

/**
 * Well-known Madurai city localities & neighbourhoods.
 * Matched case-insensitively with word boundaries so "anna nagar" -> "Anna Nagar".
 */
const MADURAI_AREAS: { pattern: RegExp; canonical: string }[] = [
  { pattern: /\banna\s*nagar\b/i, canonical: "Anna Nagar" },
  { pattern: /\bk\.?\s*k\.?\s*nagar\b/i, canonical: "KK Nagar" },
  { pattern: /\bs\.?\s*s\.?\s*colony\b/i, canonical: "SS Colony" },
  { pattern: /\bbibikulam\b/i, canonical: "Bibikulam" },
  { pattern: /\bchokkikulam\b/i, canonical: "Chokkikulam" },
  { pattern: /\btallakulam\b/i, canonical: "Tallakulam" },
  { pattern: /\bgoripalayam\b/i, canonical: "Goripalayam" },
  { pattern: /\bsellur\b/i, canonical: "Sellur" },
  { pattern: /\bnarimedu\b/i, canonical: "Narimedu" },
  { pattern: /\bk\.?\s*pudur\b/i, canonical: "K. Pudur" },
  { pattern: /\bsurya\s*nagar\b/i, canonical: "Surya Nagar" },
  { pattern: /\biyer\s*bungalow\b/i, canonical: "Iyer Bungalow" },
  { pattern: /\btiruppalai\b|\bthiruppalai\b/i, canonical: "Tiruppalai" },
  { pattern: /\bathikulam\b/i, canonical: "Athikulam" },
  { pattern: /\bkrishnapuram\s*colony\b/i, canonical: "Krishnapuram Colony" },
  { pattern: /\bviswanathapuram\b/i, canonical: "Viswanathapuram" },
  { pattern: /\breserve\s*line\b/i, canonical: "Reserve Line" },
  { pattern: /\bmahatma\s*gandhi\s*nagar\b|\bm\.?\s*g\.?\s*nagar\b/i, canonical: "MG Nagar" },
  { pattern: /\bkoodal\s*nagar\b/i, canonical: "Koodal Nagar" },
  { pattern: /\banaiyur\b/i, canonical: "Anaiyur" },
  { pattern: /\bsikkandar\s*savadi\b|\bsikandar\s*chavadi\b/i, canonical: "Sikkandar Savadi" },
  { pattern: /\barasaradi\b/i, canonical: "Arasaradi" },
  { pattern: /\bkalavasal\b/i, canonical: "Kalavasal" },
  { pattern: /\bkochadai\b/i, canonical: "Kochadai" },
  { pattern: /\bponmeni\b/i, canonical: "Ponmeni" },
  { pattern: /\bbypass\s*road\b|\bbye\s*pass\b/i, canonical: "Bypass Road" },
  { pattern: /\bellis\s*nagar\b/i, canonical: "Ellis Nagar" },
  { pattern: /\bpalanganatham\b/i, canonical: "Palanganatham" },
  { pattern: /\bt\.?\s*v\.?\s*s\.?\s*nagar\b/i, canonical: "TVS Nagar" },
  { pattern: /\bpasumalai\b/i, canonical: "Pasumalai" },
  { pattern: /\bthirunagar\b|\btirunagar\b/i, canonical: "Thirunagar" },
  { pattern: /\bharveypatti\b|\bharvey\s*patti\b/i, canonical: "Harveypatti" },
  { pattern: /\bthiruparankundram\b|\btiruparankundram\b/i, canonical: "Thiruparankundram" },
  { pattern: /\bjaihindpuram\b/i, canonical: "Jaihindpuram" },
  { pattern: /\bsubramaniapuram\b/i, canonical: "Subramaniapuram" },
  { pattern: /\bsimmakkal\b/i, canonical: "Simmakkal" },
  { pattern: /\bteppakulam\b|\bmariammankoil\s*teppakulam\b/i, canonical: "Teppakulam" },
  { pattern: /\bkamarajar\s*salai\b/i, canonical: "Kamarajar Salai" },
  { pattern: /\bmunichalai\b/i, canonical: "Munichalai" },
  { pattern: /\bkeelavasal\b/i, canonical: "Keelavasal" },
  { pattern: /\btherkuvasal\b/i, canonical: "Therkuvasal" },
  { pattern: /\bvillapuram\b/i, canonical: "Villapuram" },
  { pattern: /\bavaniyapuram\b/i, canonical: "Avaniyapuram" },
  { pattern: /\bperungudi\b/i, canonical: "Perungudi" },
  { pattern: /\bmattuthavani\b/i, canonical: "Mattuthavani" },
  { pattern: /\buthangudi\b/i, canonical: "Uthangudi" },
  { pattern: /\bothakadai\b/i, canonical: "Othakadai" },
  { pattern: /\bmelamadai\b/i, canonical: "Melamadai" },
  { pattern: /\bgomathipuram\b/i, canonical: "Gomathipuram" },
  { pattern: /\bvandiyur\b/i, canonical: "Vandiyur" },
  { pattern: /\bkaruppayurani\b/i, canonical: "Karuppayurani" },
  { pattern: /\bviraganoor\b/i, canonical: "Viraganoor" },
  { pattern: /\bsamayanallur\b/i, canonical: "Samayanallur" },
  { pattern: /\bparavai\b/i, canonical: "Paravai" },
  { pattern: /\bvilangudi\b/i, canonical: "Vilangudi" },
  { pattern: /\bthathaneri\b/i, canonical: "Thathaneri" },
  { pattern: /\barappalayam\b/i, canonical: "Arappalayam" },
  { pattern: /\bperiyar\b/i, canonical: "Periyar" },
  { pattern: /\bmeidhanam\b|\bmaithanam\b/i, canonical: "Madurai City" },
  { pattern: /\bnagamalai\s*pudukkottai\b|\bnagamalai\b/i, canonical: "Nagamalai Pudukkottai" },
  { pattern: /\bvadapalanji\b/i, canonical: "Vadapalanji" },
  { pattern: /\balagar\s*kovil\b|\balagarkoil\b/i, canonical: "Alagar Kovil Road" },
];

/** Outside-Madurai towns/cities frequently seen in Tamil Nadu orders. */
const OUTSIDE_MADURAI_CITIES: { pattern: RegExp; canonical: string }[] = [
  { pattern: /\bthirumangalam\b|\btirumangalam\b/i, canonical: "Thirumangalam" },
  { pattern: /\bmelur\b/i, canonical: "Melur" },
  { pattern: /\bvadipatti\b/i, canonical: "Vadipatti" },
  { pattern: /\busilampatti\b/i, canonical: "Usilampatti" },
  { pattern: /\bsholavandan\b/i, canonical: "Sholavandan" },
  { pattern: /\balanganallur\b/i, canonical: "Alanganallur" },
  { pattern: /\bchennai\b/i, canonical: "Chennai" },
  { pattern: /\bcoimbatore\b|\bkovai\b/i, canonical: "Coimbatore" },
  { pattern: /\btrichy\b|\btiruchirappalli\b/i, canonical: "Trichy" },
  { pattern: /\bsalem\b/i, canonical: "Salem" },
  { pattern: /\btirunelveli\b|\bnelveli\b/i, canonical: "Tirunelveli" },
  { pattern: /\berode\b/i, canonical: "Erode" },
  { pattern: /\btiruppur\b|\btirupur\b/i, canonical: "Tiruppur" },
  { pattern: /\bDindigul\b/i, canonical: "Dindigul" },
  { pattern: /\bvirudhunagar\b/i, canonical: "Virudhunagar" },
  { pattern: /\bsivakasi\b/i, canonical: "Sivakasi" },
  { pattern: /\brajapalayam\b/i, canonical: "Rajapalayam" },
  { pattern: /\btheni\b/i, canonical: "Theni" },
  { pattern: /\bkaraikudi\b/i, canonical: "Karaikudi" },
  { pattern: /\bsivagangai\b|\bsivaganga\b/i, canonical: "Sivagangai" },
  { pattern: /\bramanathapuram\b|\bramnad\b/i, canonical: "Ramanathapuram" },
  { pattern: /\bthoothukudi\b|\btuticorin\b/i, canonical: "Thoothukudi" },
  { pattern: /\bkanyakumari\b|\bnagercoil\b/i, canonical: "Nagercoil" },
  { pattern: /\bthanjavur\b|\btanjore\b/i, canonical: "Thanjavur" },
  { pattern: /\bkumbakonam\b/i, canonical: "Kumbakonam" },
  { pattern: /\bkarur\b/i, canonical: "Karur" },
  { pattern: /\bnamakkal\b/i, canonical: "Namakkal" },
  { pattern: /\bhosur\b/i, canonical: "Hosur" },
  { pattern: /\bchengalpattu\b/i, canonical: "Chengalpattu" },
  { pattern: /\bkanchipuram\b/i, canonical: "Kanchipuram" },
  { pattern: /\bpondicherry\b|\bpuducherry\b/i, canonical: "Puducherry" },
  { pattern: /\bbangalore\b|\bbengaluru\b/i, canonical: "Bengaluru" },
];

/** Keywords that strongly indicate a street/home delivery address. */
const ADDRESS_KEYWORDS = [
  /\b(?:door|plot|flat|house|shop|room)\s*(?:no\.?|number|#)?\s*[:=-]?\s*\d+/i,
  /\b(?:d\.?\s*no|h\.?\s*no|p\.?\s*no|f\.?\s*no)\.?\s*[:=-]?\s*[a-z0-9/-]+/i,
  /\b(?:no\.?|#)\s*\d+[a-z]?(?:\/\d+)?\s*,/i,
  /\b\d+[a-z]?(?:\/\d+)?\s*,\s*[a-z0-9\s]+(?:street|st|road|rd|nagar|colony|cross|lane|salai|veethi|puram|palayam|layout|extn|extension)\b/i,
  /\b(?:street|st\.|road|rd\.|salai|veethi|cross\s*st|main\s*road|bypass|lane|avenue)\b/i,
  /\b(?:nagar|colony|layout|extension|extn|enclave|gardens|apartments|apt|flats|towers|villa|residency|compound)\b/i,
  /\b(?:near|opp\.?|opposite|behind|beside|next\s+to|landmark|above|below|ground\s+floor|1st\s+floor|2nd\s+floor|first\s+floor|second\s+floor)\b/i,
  /\b(?:address|delivery\s+address|deliver\s+to|ship\s+to|my\s+location)\s*[:=-]/i,
  /\b(?:pincode|pin\s*code|pin)\s*[:=-]?\s*6\d{5}\b/i,
];

/** Messages that are definitely NOT addresses (greetings, order confirmations, short replies). */
const NON_ADDRESS_PATTERNS = [
  /^\s*(?:hi|hello|hey|vanakkam|ok|okay|yes|no|thanks|thank\s+you|super|fine|good|sure|done|paid|sent)\s*[.!]*\s*$/i,
  /^Placed an order from the catalogue/i,
  /^Reacted\s/i,
  /^\[(Photo|Video|Voice note|Document|Sticker|Location)\]/i,
  /^Allowed you to call|^Declined calls/i,
  /^\s*(?:price|rate|cost|how\s+much|catalog|catalogue|menu|oil|ghee|item|available)\s*\??\s*$/i,
];

/**
 * Parses a raw address or chat message and extracts:
 * - fullAddress (cleaned)
 * - area (canonical locality or city)
 * - region ("Madurai city" | "Outside Madurai" | "Not sure")
 * - pincode (6 digits if present)
 * - isLikelyAddress & confidence score
 */
export function parseAddressText(rawText: string, homeCity?: string | null): ParsedAddress {
  const raw = rawText.trim();
  if (!raw) {
    return { fullAddress: "", area: null, region: "Not sure", pincode: null, isLikelyAddress: false, confidence: 0 };
  }

  for (const skip of NON_ADDRESS_PATTERNS) {
    if (skip.test(raw)) {
      return { fullAddress: raw, area: null, region: "Not sure", pincode: null, isLikelyAddress: false, confidence: 0 };
    }
  }

  // Handle WhatsApp shared location pin: "Location: ... (https://maps.google.com/?q=...)"
  const isLocationPin = /^Location:\s+/i.test(raw) || /maps\.google\.com\/\?q=/i.test(raw);

  // Strip leading "Address:" / "Delivery address:" prefix if the customer wrote it
  const cleaned = raw
    .replace(/^\s*(?:my\s+)?(?:delivery\s+|shipping\s+)?(?:address|location)\s*(?:is)?\s*[:=-]\s*/i, "")
    .replace(/\s*\n+\s*/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Check for 6-digit Indian pincode (Tamil Nadu starts with 6)
  const pinMatch = cleaned.match(/\b(6\d{5})\b/);
  const pincode = pinMatch ? pinMatch[1] : null;

  // Match known Madurai city localities first
  let area: string | null = null;
  let region = "Not sure";

  for (const loc of MADURAI_AREAS) {
    if (loc.pattern.test(cleaned)) {
      area = loc.canonical;
      region = "Madurai city";
      break;
    }
  }

  // Check outside Madurai towns/cities if not already matched as a Madurai locality
  if (!area) {
    for (const city of OUTSIDE_MADURAI_CITIES) {
      if (city.pattern.test(cleaned)) {
        area = city.canonical;
        region = "Outside Madurai";
        break;
      }
    }
  }

  // Pincode-based region inference when locality wasn't in our dictionary
  if (pincode) {
    if (pincode.startsWith("625")) {
      // 625001..625023 & 625104..625107 are Madurai city / metro; other 625xxx are Madurai district outskirts
      const pinNum = Number(pincode);
      if ((pinNum >= 625001 && pinNum <= 625025) || pinNum === 625104 || pinNum === 625107) {
        if (region === "Not sure") region = "Madurai city";
      } else if (region === "Not sure") {
        region = "Outside Madurai";
      }
    } else if (region === "Not sure") {
      region = "Outside Madurai";
    }
  } else if (/\bmadurai\b|\bmdu\b/i.test(cleaned) && region === "Not sure") {
    region = "Madurai city";
  }

  // Fallback area extraction: look for "<Name> Nagar / Colony / Puram / Patti / Salai" in the text
  if (!area) {
    const genericArea = cleaned.match(
      /\b([A-Z][a-zA-Z.]{2,20}(?:\s+[A-Z][a-zA-Z.]{2,20})?\s+(?:Nagar|Colony|Puram|Palayam|Patti|Kulam|Salai|Layout|Extension|Extn))\b/i,
    );
    if (genericArea) {
      area = genericArea[1]
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } else if (region === "Madurai city") {
      area = "Madurai";
    }
  }

  // Calculate confidence score for automatic chat extraction
  let score = 0;
  if (isLocationPin) score += 85;
  if (/^\s*(?:my\s+)?(?:delivery\s+|shipping\s+)?address\s*[:=-]/i.test(raw)) score += 60;
  if (pincode) score += 45;
  if (area) score += 30;
  if (/\bmadurai\b/i.test(cleaned)) score += 20;

  let keywordHits = 0;
  for (const kw of ADDRESS_KEYWORDS) {
    if (kw.test(raw)) {
      keywordHits++;
      score += 22;
    }
  }

  // Comma-separated or multi-line structure with door/building numbers
  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const lineCount = (raw.match(/\n/g) ?? []).length;
  if (commaCount >= 2 || lineCount >= 2) score += 18;
  if (/\b\d+[/-]?\d*\b/.test(cleaned) && (commaCount >= 1 || lineCount >= 1)) score += 12;

  // Penalize questions or very short / very long messages
  if (raw.includes("?") && !isLocationPin) score -= 30;
  if (cleaned.length < 10 && !area && !pincode && !isLocationPin) score = 0;

  const confidence = Math.max(0, Math.min(100, score));
  const isLikelyAddress =
    isLocationPin ||
    confidence >= 45 ||
    Boolean(pincode && cleaned.length >= 12) ||
    Boolean(area && keywordHits >= 1 && cleaned.length >= 12);

  // Clients outside Madurai: the Madurai locality and pincode rules don't apply, so use the simple city rule.
  if (!usesMaduraiRules(homeCity)) region = regionInCity(cleaned, homeCity!.trim());

  return {
    fullAddress: cleaned,
    area,
    region,
    pincode,
    isLikelyAddress,
    confidence,
  };
}

/**
 * Given a list of recent WhatsApp replies from a customer, returns de-duplicated
 * candidate addresses ordered by confidence and recency.
 */
export function findAddressesInReplies(
  replies: { id?: string; text: string; receivedAt: Date }[],
  homeCity?: string | null,
): {
  text: string;
  fullAddress: string;
  area: string | null;
  region: string;
  pincode: string | null;
  confidence: number;
  receivedAt: Date;
}[] {
  const seen = new Set<string>();
  const candidates: {
    text: string;
    fullAddress: string;
    area: string | null;
    region: string;
    pincode: string | null;
    confidence: number;
    receivedAt: Date;
  }[] = [];

  for (const r of replies) {
    const parsed = parseAddressText(r.text, homeCity);
    if (!parsed.isLikelyAddress) continue;
    const key = parsed.fullAddress.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      text: r.text,
      fullAddress: parsed.fullAddress,
      area: parsed.area,
      region: parsed.region,
      pincode: parsed.pincode,
      confidence: parsed.confidence,
      receivedAt: r.receivedAt,
    });
  }

  return candidates.sort(
    (a, b) => b.confidence - a.confidence || b.receivedAt.getTime() - a.receivedAt.getTime(),
  );
}

/**
 * Resolves the best display address and area for an Order + Customer pair.
 */
export function resolveOrderAddress(order: {
  note: string | null;
  customer: { location: string | null; locationRaw?: string | null; region?: string | null };
}): {
  fullAddress: string | null;
  area: string | null;
  region: string | null;
  source: "order" | "customer" | null;
} {
  const orderNote = order.note?.trim() || null;
  const custRaw = order.customer.locationRaw?.trim() || null;
  const custArea = order.customer.location?.trim() || null;

  if (orderNote) {
    const parsed = parseAddressText(orderNote);
    return {
      fullAddress: orderNote,
      area: custArea || parsed.area,
      region: order.customer.region || (parsed.region !== "Not sure" ? parsed.region : null),
      source: "order",
    };
  }
  if (custRaw || custArea) {
    return {
      fullAddress: custRaw || custArea,
      area: custArea,
      region: order.customer.region || null,
      source: "customer",
    };
  }
  return { fullAddress: null, area: null, region: null, source: null };
}
