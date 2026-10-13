/*
 * Delivery regions are relative to each client's home city: "<City> city", "Outside <City>" and
 * "Not sure". Clients created before home cities existed have none set and stay on Madurai, so
 * their saved regions ("Madurai city", "Outside Madurai") keep working unchanged.
 */

export const LEGACY_HOME_CITY = "Madurai";
export const NOT_SURE = "Not sure";

/** The client's home city, or Madurai for clients set up before it could be chosen. */
export function homeCityOf(client?: { homeCity?: string | null } | null): string {
  return client?.homeCity?.trim() || LEGACY_HOME_CITY;
}

/** True for Madurai, which has the detailed locality and pincode rules in lib/address.ts. */
export function usesMaduraiRules(city: string | null | undefined): boolean {
  return !city?.trim() || city.trim().toLowerCase() === LEGACY_HOME_CITY.toLowerCase();
}

/** The three regions a customer can be in, home city first. */
export function regionsFor(city: string): [string, string, string] {
  return [`${city} city`, `Outside ${city}`, NOT_SURE];
}

/** The region for a customer with an area typed in but no region picked. */
export function defaultRegion(city: string): string {
  // Madurai clients always assumed a typed area was local; elsewhere we don't guess.
  return usesMaduraiRules(city) ? regionsFor(city)[0] : NOT_SURE;
}

/** Cities and big towns customers commonly write, for telling "outside the home city" apart. */
const KNOWN_PLACES = [
  "chennai", "madras", "coimbatore", "kovai", "madurai", "trichy", "tiruchirappalli", "tiruchi", "salem", "tirunelveli", "nellai", "erode",
  "tiruppur", "tirupur", "vellore", "thoothukudi", "tuticorin", "thanjavur", "tanjore", "dindigul", "karur", "nagercoil", "kanyakumari",
  "kanchipuram", "kancheepuram", "hosur", "krishnagiri", "dharmapuri", "namakkal", "pudukkottai", "sivakasi", "virudhunagar", "ramanathapuram",
  "karaikudi", "kumbakonam", "cuddalore", "villupuram", "tiruvannamalai", "ooty", "pollachi", "theni", "rajapalayam",
  "pondicherry", "puducherry", "bangalore", "bengaluru", "mysore", "mysuru", "hyderabad", "mumbai", "delhi", "pune", "kolkata",
  "kochi", "cochin", "trivandrum", "thiruvananthapuram", "kozhikode", "calicut", "palakkad", "thrissur",
];

/** Other names customers use for the same city. */
const SAME_CITY = [
  ["chennai", "madras"], ["coimbatore", "kovai"], ["trichy", "tiruchirappalli", "tiruchi"], ["tirunelveli", "nellai"],
  ["tiruppur", "tirupur"], ["thoothukudi", "tuticorin"], ["thanjavur", "tanjore"], ["kanchipuram", "kancheepuram"],
  ["pondicherry", "puducherry"], ["bangalore", "bengaluru"], ["mysore", "mysuru"], ["kochi", "cochin"],
  ["trivandrum", "thiruvananthapuram"], ["kozhikode", "calicut"],
];

/** The city and the other names it goes by, lower case. */
const namesOf = (city: string) => {
  const c = city.toLowerCase();
  return SAME_CITY.find((g) => g.includes(c)) ?? [c];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, place: string) => new RegExp(`\\b${escape(place)}\\b`, "i").test(text);

/**
 * The region of an address for a client whose home city isn't Madurai. Deliberately simple:
 * the home city named → in the city; another known city named → outside; otherwise not sure.
 */
export function regionInCity(text: string, city: string): string {
  const [inCity, outside] = regionsFor(city);
  const home = namesOf(city);
  if (home.some((n) => mentions(text, n))) return inCity;
  if (KNOWN_PLACES.some((p) => !home.includes(p) && mentions(text, p))) return outside;
  return NOT_SURE;
}
