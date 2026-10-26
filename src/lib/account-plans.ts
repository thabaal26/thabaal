// Thabaal Account Module: Authoritative Plans, Pricing, Limits, Features, QR Codes & Invoice Helpers
// Source of Truth: Thabaal_Pricing_Plans_Final.pdf & Thabaal_Brochure_221026.pdf (22 Oct 2026)

export type BillingCycle = "m" | "q" | "y";

export type PlanKey = "starter" | "growth" | "business";

export type PlanLimits = {
  num: number;
  staff: number;
  camp: number;
  tmpl: number;
};

export type PlanDef = {
  k: PlanKey;
  n: string;
  nTa: string;
  tag: string;
  tagTa: string;
  p: { m: number; q: number; y: number };
  lim: PlanLimits;
  pop?: boolean;
  f: string[];
  fTa: string[];
};

export const PLANS: readonly PlanDef[] = [
  {
    k: "starter",
    n: "Starter",
    nTa: "தொடக்கத் திட்டம்",
    tag: "Start campaigns and keep customer orders together.",
    tagTa: "பிரச்சாரங்களைத் தொடங்கி, வாடிக்கையாளர் ஆர்டர்களை ஒருங்கிணைத்து பராமரிக்கவும்.",
    p: { m: 1199, q: 3237, y: 11510 },
    lim: { num: 2, staff: 1, camp: 5, tmpl: 10 },
    f: [
      "2 WhatsApp numbers",
      "1 staff login",
      "5 campaigns a month",
      "10 templates",
      "UPI payment requests",
      "Overview report",
      "Ticket support",
    ],
    fTa: [
      "2 வாட்ஸ்அப் எண்கள்",
      "1 ஊழியர் கணக்கு",
      "மாதம் 5 பிரச்சாரங்கள்",
      "10 டெம்ப்ளேட்கள்",
      "UPI கட்டண கோரிக்கைகள்",
      "சுருக்க அறிக்கை",
      "டிக்கெட் ஆதரவு",
    ],
  },
  {
    k: "growth",
    n: "Growth",
    nTa: "வளர்ச்சித் திட்டம்",
    tag: "Follow up on orders and understand repeat customers.",
    tagTa: "ஆர்டர்களை பின்தொடரவும், மீண்டும் வாங்கும் வாடிக்கையாளர்களை புரிந்து கொள்ளவும்.",
    p: { m: 2999, q: 8097, y: 28790 },
    lim: { num: 3, staff: 3, camp: 20, tmpl: 50 },
    pop: true,
    f: [
      "3 WhatsApp numbers",
      "3 staff logins",
      "20 campaigns a month",
      "50 templates",
      "Auto payment requests, reminders + COD tracking",
      "Packing lists + order slips (print/image)",
      "Loyalty points, tiers and checkout",
      "Refill reminders + win-back messages",
      "Overview + customer reports",
      "Ticket + email support",
    ],
    fTa: [
      "3 வாட்ஸ்அப் எண்கள்",
      "3 ஊழியர் கணக்குகள்",
      "மாதம் 20 பிரச்சாரங்கள்",
      "50 டெம்ப்ளேட்கள்",
      "தானியங்கி கட்டண கோரிக்கைகள், நினைவூட்டல் & COD",
      "பேக்கிங் பட்டியல் & ஆர்டர் ரசீதுகள்",
      "லாயல்டி புள்ளிகள் & அடுக்குகள்",
      "மீள்-ஆர்டர் நினைவூட்டல் & திரும்ப வரவழைக்கும் செய்திகள்",
      "சுருக்கம் மற்றும் வாடிக்கையாளர் அறிக்கைகள்",
      "டிக்கெட் மற்றும் மின்னஞ்சல் ஆதரவு",
    ],
  },
  {
    k: "business",
    n: "Business",
    nTa: "வணிகத் திட்டம்",
    tag: "Give a larger team complete reports and more capacity.",
    tagTa: "பெரிய குழுவுக்கு முழுமையான அறிக்கைகள் மற்றும் கூடுதல் செயல்திறனை வழங்கவும்.",
    p: { m: 4999, q: 13497, y: 47990 },
    lim: { num: 5, staff: 5, camp: 50, tmpl: 100 },
    f: [
      "5 WhatsApp numbers",
      "5 staff logins",
      "50 campaigns a month",
      "100 templates",
      "Everything in Growth",
      "Full reports: overview, campaigns, customers, products",
      "Excel / Google Sheets export",
      "WhatsApp calling",
      "Your logo, colours + custom order fields",
      "Ticket + email + call support",
    ],
    fTa: [
      "5 வாட்ஸ்அப் எண்கள்",
      "5 ஊழியர் கணக்குகள்",
      "மாதம் 50 பிரச்சாரங்கள்",
      "100 டெம்ப்ளேட்கள்",
      "வளர்ச்சித் திட்டத்தின் அனைத்து வசதிகளும்",
      "முழு அறிக்கைகள்: சுருக்கம், பிரச்சாரங்கள், வாடிக்கையாளர்கள், பொருட்கள்",
      "Excel / Google Sheets ஏற்றுமதி",
      "வாட்ஸ்அப் குரல் அழைப்பு",
      "உங்கள் லோகோ, பிராண்ட் வண்ணங்கள் & தனிப்பயன் ஆர்டர் புலங்கள்",
      "டிக்கெட், மின்னஞ்சல் மற்றும் தொலைபேசி ஆதரவு",
    ],
  },
] as const;

export const CYCLE_NAMES: Record<BillingCycle, { en: string; ta: string }> = {
  m: { en: "monthly", ta: "மாதந்தோறும்" },
  q: { en: "every 3 months", ta: "3 மாதங்களுக்கு ஒருமுறை" },
  y: { en: "every 12 months", ta: "12 மாதங்களுக்கு ஒருமுறை" },
};

export const CYCLE_SUFFIX: Record<BillingCycle, { en: string; ta: string }> = {
  m: { en: "per month", ta: "மாதத்திற்கு" },
  q: { en: "for 3 months", ta: "3 மாதங்களுக்கு" },
  y: { en: "for 12 months", ta: "12 மாதங்களுக்கு" },
};

/** Authoritative add-ons from Thabaal_Pricing_Plans_Final.pdf (page 3) */
export const ADDONS = {
  staff: { price: 499, per: "per month each", perTa: "மாதத்திற்கு ஒருவருக்கு" },
  number: { price: 599, per: "per month each", perTa: "மாதத்திற்கு ஒரு எண்ணிற்கு" },
  metaSetupMonthly: { price: 299, per: "one-time on monthly plan", perTa: "மாதத் திட்டத்தில் ஒருமுறை" },
  metaSetupLonger: { price: 0, per: "Free on quarterly / yearly plans", perTa: "3 அல்லது 12 மாதத் திட்டங்களில் இலவசம்" },
} as const;

export const SUPPLIER_INFO = {
  name: "thabaal",
  legal: "CupNSaucerLLP",
  addr: "Madurai, Tamil Nadu",
  gstin: "", // Empty: Thabaal generates Bill of Supply unless GSTIN is registered
  state: "Tamil Nadu",
  code: "33",
  phone: "6379140626",
  email: "thabaal26@gmail.com",
  vpa: "cupnsaucer@upi",
  sigrole: "Authorised signatory",
  sigroleTa: "அங்கீகரிக்கப்பட்ட கையொப்பமிட்டவர்",
};

export const INDIAN_STATES: readonly [string, string][] = [
  ["Tamil Nadu", "33"],
  ["Andhra Pradesh", "37"],
  ["Karnataka", "29"],
  ["Kerala", "32"],
  ["Telangana", "36"],
  ["Maharashtra", "27"],
  ["Delhi", "07"],
  ["Gujarat", "24"],
  ["Puducherry", "34"],
  ["West Bengal", "19"],
  ["Uttar Pradesh", "09"],
  ["Rajasthan", "08"],
  ["Other state", ""],
] as const;

export const PLAN_COMPARISON_ROWS = [
  { f: "WhatsApp numbers", fTa: "வாட்ஸ்அப் எண்கள்", s: "2", g: "3", b: "5" },
  { f: "Staff logins", fTa: "ஊழியர் கணக்குகள்", s: "1", g: "3", b: "5" },
  { f: "Campaigns per month*", fTa: "மாதப் பிரச்சாரங்கள்*", s: "5", g: "20", b: "50" },
  { f: "Active approved templates*", fTa: "செயலில் உள்ள டெம்ப்ளேட்கள்*", s: "10", g: "50", b: "100" },
  { f: "Customer records, tags, areas and segments", fTa: "வாடிக்கையாளர் பட்டியல், குறிச்சொற்கள், பகுதிகள்", s: "Unlimited", g: "Unlimited", b: "Unlimited" },
  { f: "WhatsApp catalogue and order board", fTa: "வாட்ஸ்அப் பட்டியல் மற்றும் ஆர்டர் பலகை", s: "Included", g: "Included", b: "Included" },
  { f: "UPI payment requests", fTa: "UPI கட்டண கோரிக்கைகள்", s: "Included", g: "Included", b: "Included" },
  { f: "Auto payment requests + reminders + COD tracking", fTa: "தானியங்கி கட்டண கோரிக்கைகள் + நினைவூட்டல் + COD", s: "–", g: "Included", b: "Included" },
  { f: "Packing lists and order slips (print/image)", fTa: "பேக்கிங் பட்டியல்கள் & ஆர்டர் சீட்டுகள்", s: "–", g: "Included", b: "Included" },
  { f: "Loyalty points, tiers and checkout", fTa: "லாயல்டி புள்ளிகள், அடுக்குகள் & செக்அவுட்", s: "–", g: "Included", b: "Included" },
  { f: "Refill reminders and win-back messages", fTa: "மீள்-ஆர்டர் நினைவூட்டல் & மீட்டுக்கொள்ளும் செய்திகள்", s: "–", g: "Included", b: "Included" },
  { f: "Business reports", fTa: "வணிக அறிக்கைகள்", s: "Overview only", g: "Overview + Customers", b: "Overview, Campaigns, Customers + Products" },
  { f: "Excel / Google Sheets business-data export", fTa: "Excel / கூகுள் தாள்கள் ஏற்றுமதி", s: "–", g: "–", b: "Included" },
  { f: "WhatsApp calling", fTa: "வாட்ஸ்அப் குரல் அழைப்பு", s: "–", g: "–", b: "Included" },
  { f: "Logo, colours and custom order fields", fTa: "லோகோ, பிராண்ட் வண்ணங்கள் & பிரத்யேக புலங்கள்", s: "–", g: "–", b: "Included" },
  { f: "Support system", fTa: "தொழில்நுட்ப ஆதரவு", s: "Ticket", g: "Ticket + email", b: "Ticket + email + call" },
] as const;

export const QR_CODES: Record<string, string> = {
  "starter-m": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACnElEQVR42u1aMXLkQAhEp2DDfYKeMk8bPU1P2Sds6GBLmG5Aa58T14UHE3hq5Ym6oGkaRH93HtIP++HPhy/BWfjDft30MXZZ9Sl2ye3J/9rHP/LL8189JCB2Fv2QTfVcP+56zBOACDB+2kdiVhcei5C5AInDLoNHGTabMoi2Q5aGB7g8ZMqKS+I6gVLDE/BY2AAJJFei1NET3POSu3EySWfsIB3DjNFTnXu8cr1u5J4fV/XKlccq1wGwkGPMOBb2SwEUTi5LJ8YLcgyAWI6JgTXtr2VcbXiobQiInRN6EKkGeJhxMvQsnVwUgixSkIXkZGJ2oL6La6LaleuYwT3OyYkLOXloU7MyQgaaCjJ0dmDifF0+uRA9VDrOyZCFUEFex0pTM+CRkMsaZLwiemZAtxSXhS54EDbesUte7Lkmwaqse9iLRnIBF/+IMt+y8Pa8cJkUPFBBDBtgttHeqJxcxMXVYbIN+3f9IqUrq2ahtaMkHdXgnuzfZWobGu4PqriZmiYzCGlobdWcRg/kciidRdNyZsaVl4XiswkXPIPmGAs7i76ULuyJ0tWjY6xDana/Z19qGxrOPXbGnnaYO8+EbuzV/R7LqpA/4oZG+D04W7uFcAuZXFO8JQ1OjhyrbYfFJFScodFbSMwtgq87ucA99/B7JJyMtzpcy1PzyYlfDtcXcnIM3vceA+7sPun3fNHQXse65xpRw10PMl7+asQqGxpXDad3QdOQFd2nO1Oae3xgIW/bJyt6bvsUn7H7ZOv0tbBvrlj15NKkX1fNb8s5ZmCyau/3uD8YItEXWDyyZi/P+coK2wiJnUskl8dSwzMdl1CHkk4Geguv7+U3UzU2dqGa2WJckvFsOyzaiKhVET3h/nTP1Vvx/fAfHn4Cei7SEvv/WegAAAAASUVORK5CYII=",
  "starter-q": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACnUlEQVR42u1asZHDMAyjPkXKjOBRPJo8mkfxCCld5MwXAErJ3Td/Xz6lRidbFY8EAULmv1uHzYvz4s+LL8Mq7k/st/NxmF1t872d9NHufnzZL9e/utjCc0eciiMu9TJDXNxPs9URs6X9fKUOT8uQWphECI8tvrUTgoXsWXYrMzwIQUuby7jpI7cZnsiex7E6T+vW0qZHaYaH2NOKa9mRRA1tNldxTewZnYuJUn9u2TtXLGTI6hdaOYvrSaC+DwaQGnvIexZ29EeUGqJk/V/q4mp1BLRB5xImq6MjexCzK3dxPYU9rbhaVZ3gPU6SaIE9iFnm4lKGoEkxUVhVTW9UyY7k2QP9sBFfRJ5H5xJss9RSFxey50ZMJh/EOkESP6hR5uxpVWUUW87TLqbTcalabuxxSXUTCoM1E4ybYpfEuHIXF8A4eI9hoAGE7k2/nbaJPdYJcuQS6U8NTnRlFxW7WpaTJy8YjrGjF3HoK3v2DM1lnPfUmHIEGfLkogLrFrxnTHjebd4sfWMPFC4C6hBbEhU1N+8JN4LhCUkaYkuwXVMXV59kCIylTDU09IDtqdhrYI/mGrVAiA1OlNznAjP2j9kFeA8BCa7XkRx7er4IdJz2aGAyrdM1d2OnCI2x8ibeozbPuAxcymzk7OFzbZQR3ifywRVL9lE8LYre0bvxF5byXtN77GN8qqra3k84nktyzUX9sI354Ie5Xnkih849itdMh6IiLApUlWnsU8truqThksbXW7iB49lGdo+dhKe6eA8/api6iBOlf6ERL1dOucfkisGCstuAFoMej3FYn5HFkzGb4Sma93yYgsieQZ5neKg+9SS1xkS+k8SJPaX7f+zoYSkHV8yNPepc7wbW3WP5f+65Ndd8FT8v/vXiN1kO3U52L79vAAAAAElFTkSuQmCC",
  "starter-y": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACjklEQVR42u1asZHDMAyT30XKjPCjeDRptIziEVym8BlPAlLsXJr/9kkV0SlWhSNAkFTB79Za8mJe/Ly4F18TsH0/yjE//eSbnbDfNn69Yf0qv1z/6qJD4DhNeN5BeO5AA4gSHDP72UPDYxFSJwsiixdfttnpvpZqYbPxlPDsRKLMFixilVMt4bnCQx5tZWnvKAWHh9pDctWu0BC5ptSekbkYKPVzi565+mIQNXHMyeWMM+15OYDQ2mO+h06H+V1Ucwkq/RtCk4t+UPEiTfboMXIdgie09sgPutNxXEgnt4UmzbI/SwtNLjfIS5PMNI+elayyeqNCjIsNDxdlZoEkqLugNiIrNjwbi1CKDjeITgsu1ig2uXABq1cTxjj5nuoeOnJiV+byeNFiUcHoIUpH7IbGJsNjhwomsDo+qr0Ru+YiIExSJjo7U5YkaBRioaNH2YmGR0ZQmYtUc+iAY0ZweCpUTXQJGij1ij2471kpM9QeZa5p/zCJgRO7nLEHiljVzjahB1Fs30NbyHhxjtEd9kaPIqtmxV59REGO4Wz7aD1qaGl2eMwIvqX5aQxyevcnuC30lCUkRCeOAQH1e4L7HqZy4sIRxdBkH18oepDa0xMY2z6PUkYFRkGKrT03+p7CxuBglbdWl3aNrMA1F32yr9pri+n8M3rN1Udavbus1qoU+pTt6P2eqklFucwmlNHZ7wmuPazY3f5AQVShOddg3IyckrLYki3UM59Hhy649nBT76KVy/OnBaMkBfKFBk/MVV5zjedPWXO93vecSsQynlQrOanoj+ecVWOCcynVl3yhMaKnjtaqOvJ6W5jaw1JdFuccG0t7+twiX4ddRhT8S37Qm2P5BCFfxefFv1/8AcTX43dQ7ALjAAAAAElFTkSuQmCC",
  "growth-m": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACnklEQVR42u1aMZICMQxzbosteQJP2aclT+MpPIGSgokvkpwdbmju2nO2gGFJpbFkyY757567rYPr4OfBl+Ep7o/rrfbtebkfbtvTbHzZ/uC/u9+/7JfPvzo44NmBUwFWR+sDkOvt/A+YjY9XanhGhdQiJDrrpXazi3uzDSVlZcGj6nFQbQDSQS6zqKUFz4AHgFSXBJngWdVzag/LJoqoASVybF/ao871Ao/q51f2zjWfJ0RnsAqaTMYdDbhMB5CYXINO1Bc6HfV3Um18wgWlhsdhBJs8IsWYVGMDI7mO3NrDXgVWAZDoY28vZ9NPrT2wy2xZr/0NF4YKRIzU5EK8CteMN1dKs8CyKKnUthAQoHMhevGLmixdQh/z9NUT2oMG5rcaXpHw0P5kh6dvlCBmC7IK7axvMeVI3tgtysaIC7Mof70NhjJ3LmR0/zHXMJvd3lvyUMHmrQnPKdRASb8QV1NHUgSHzvzQ+IpOB5jRDFldjT2MoPr7rQoXTcUOL+kbOx3g7O9wOhOlxzSJqcdh7OjTIA+FHoyDXvNEzR0qIDNNvseDaoV2WeMNxvjc5EKFcMHFsiG51MfIuDXvkdpodWMkl8W6Cy4oc/UoPxR/m4NNTQ6OZR/FX6nC3B7rKcIsdsnpM9cxJxlFe4uuiXx4xeTDVGVR7mzmYN7nFJUcy+57sBdljKBBFi4YObOP5c5cqhDePWDZXOR0pl1Wml+ZSzt2ueauZKoNanbXHHaZHIs5mJKGpmIKqMl37Eqm6uges2bTBZbk5PKQX9fa+Lz3VMsp2+t+z3PGq3mVTtnC1jiMKWtXqIgrCNSeKKIFD/foVOjIohoCcW+RXJrjZqoMz7yqqy2p/kue2COExoMxYVSPXHPry/esW/Hr4N8PfgO7ysgmn73W5AAAAABJRU5ErkJggg==",
  "growth-q": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACnklEQVR42u1au3XDMAyE4sKlR/AoHI0cTaN4BJUq9ITgDiDl99w4bUA1SmRW94D7ABT97nnJPDgPfh48BM+i+0PXuhx3+1bPm/22Vrnpxl/t4498+fyrgwbPHTgtOgB5GkpArjR7bU/780gNj1WIlY39XaKianw8CZYsEx7A44WCdooes9eEJ+Bhj7GPSrvKZsLj3HMIqNlY2NimGV8/UD2Te7pysVDq5yu7csWDeomu0uaKXk+5DweQmnvoe15FaX/YaqZjDa3G31LD40Zwh3LZyyhIwv6cQmpOzj3GwuLKFUawKWrJCcmOwENnpmaok6J6Wgg7ydjcoeqEZzhAIfcArF5EKCm2Wm5hL3oKnY569Arf845gWmGnVnk7hYA1BlRQEPU9dfU4BGFvPGy5lWZwt45ryanZBz0RKuAOlXy9CjpOaRJzCzsnGRsHGlR0tz/VUaJ5Tk7NrB4UCpgIvkcQ452XUjcXkIByMYTCPBvbLF257kzsqskjKUMoQoXQ6SCI2X8gna5qmW1haV25XKvEUfJQUdPPewCIP6yXFmErQkXuxB6Dnp0idcHTSack556Y8ERi332KundeMnhyc88Vtnq2GNMfD2LJfc+jczJQ4jgsONmJOrnv6bOLHq/6CKP4EGiV7LbQLQ7guWLENrnnLXOdY7mOWvIde7fSyXfsGGEIw7nGfPC8hqnP5JnriLClHIfR8HDdxZzqhJQ+VMQcrCvXu6P2/fvckj6chePmSpjn0WrJd+ycazSRvlxnTo1Ve/It6QgVwzX7ejSCe3Zq9utPmKJKXOwZHSfZNxXj+tPGMWGf/qCrhnme8LiAxVxD3y/PVZ3cEz558Q3O4jcwYzeY/QqCxGWM0mLVzk8RUAO65L5n3oqfB/988BcPNvLn8yUKEwAAAABJRU5ErkJggg==",
  "growth-y": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACmElEQVR42u1aMXKEQAwzuYKSJ/AUnrY8jafcEygpbnBWkpcjc03SxktDuGylsWVJXvPfPU/rB/vBz4MvwzPgY/H62s3K+fB93oq/xp3/Hf35Zb98/tXBCs8InIBLBYQvflXkiusLRxLDg3oZiNJ6olAWjx9r2VTMbOjwDOixZcVXAOKbnR2eGzxzq55V3ANcOjzinpdNaq7KNrWIbKrcM3TuaZOLhVI+X9knVzyokErG6Cpf8cJ8t/FSAKm5h7oHZPw4JsgfETUmV9NEeZtr8q1oSKF6gJJJFp6C50zdXIdR4oCMBValZj/wBb7WHEs9uZ6yERKCGOx8QTUfEzsudXPZWwiiluawGJjv/DG959qK/GllYdZLm2O3AkvNPaqQxU8j28iLruHfLXNzRR9xsAsJi1ajJa3zPfXkosRx/FlJx6B7woFhvh+YY9k9F7rqwfkeE/1suAClklv3OH2V4AH3kJpZUvKpnl33uHJTzPdG1JTSzbFnNhVOl9VshEwFwXLK5dpj2XUPBLIiDLaaVHNDiZWV27GDZthjUS8R9NxXGpl1D2JlkjFZeCE8QTqevXqok6+lRHDy0XgpO/eoeuRF11OyECqoVo/ynty6h7Iw7JXdVhRmfbD/qJ5wn0oLuc2UjU+e90yxXJ+ZNVtLUWncY/GePYqPyPnauFMrYpxl91x3mlmFUqQ/Wimn91wt0/HIVOUm4DQi70kOz8zsQs0lj06RuPKVPi3UllSpGCdXONMSbj59WvjO4G/Xn8JbREyf/YYGjftwbdyvHbtqqd/vMXtf7AnB8+rcc8HDJbK6SlK63MVz+ruFLflqEcZ1t7BzT9zYbQwdN1Nj1Z59x268jGESyHtsvUIPOpel6XVPvxXfD/754Dd5Nu5HnZwLfQAAAABJRU5ErkJggg==",
  "business-m": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAAClUlEQVR42u1aO3aDQAwUoaDkCDkKR1uO5qNwBJcu/FaRRrPgPDdOG4kivOCt5kmaj1b0s+eQOlgH3w8+xZ/pKesh0me9f+s+abyeyx2/Lnp8yYfPvzpo8CyOU8DTZH6sxzbA67IYSupHEsNjFdImR+nWun2xsgEgm6KIbjIVPJM+RLadZQOw1P8reFg94l3Fj1E2rarnnD3+5+YoieFi31cdEzr57CFzLaiXt1d25hrPw4nd60WCwKyWXhVA4uY6WCHSrJZWRTvdKYbUWy11c6FQRjsBHlOHTuwdRSQyJ64e66qLyq2rbDSbeDaaB9s7PFPm5gry1qF7QjX/0j09dfW482rkcIxm6yoZPeaDumdnLnMT3lW6Oy4HS4pgSUtO7DQVK12WfQRK246uKsd+TRvvI6fyGaYi/Pue2lQoODwkDgoFugfxRg94Uo/msKQoG8weWtJRUq4VUxM7ZrILHvEcDC/onm3HAX8lby4RMheQMPkTUnoa0CVvLh+/mDZkrhMeRM654QGHg9/ZR1Q6hhlMRZP0qllor4QmdPj3JQxH7tH8MqEFXeUrivO33MyF+JQ5WGQX2xloYJGTXPcgVg7BExEGAdm4KMxtKpCics9FkRgB9KZRS3utAbn/i4VFJBnfHiGi8SpMjU2Fci/a9DIVFcUjwgjVzMj5dGDg9/SjGQKZSYaG/JGRoib3XFTNVIBP3smgxYBBzb1EFi5rRgCmA6V9bFBzbyqUi79zYaHCRU6w/ZRcNQsWouDwmD3Mmrlqz75EjjVgLNexyOFAQrR6k5KFbcATZXMadzxdCp64PId8MF7nnahKC4W4XA6Md8Wqua7bYREyu/XilvSFwIq5MGbm2LhH9XQG86V76lZ8Hfz7wR+8Cd2QkTStoAAAAABJRU5ErkJggg==",
  "business-q": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAAClElEQVR42u1asZHDMAyj30XKjJBRPJo8mkfxCC5d5MQnAUr2XZp8+5QanWxVOBIESIl+t3YZF8fFz4tv8TXpKS9V2567SJ3ttNm/x4G/D91/5Mv1ry46BI6Tw+Mng0c333jSwzDzK4nhsQgp01ue+7L6FwsbnKRY2Bw4DXgMENW1Wh4ps8pwqQOeDo9ti3q8iAXRrDeUksMD7gFDF8PlACcjuabBPa1yIVDK55a9csV6g3Su5PKMAxOFAkjNPRKF3XVPSzWvY/FPcyfXsrrE8XghJ5OCPHqOoKfM8LwQL6YHXekYPqtSPIcYyp1cjgsljipIB1llfqNANW+SGh5klacTAXGzxcrFIDLoUnMPIHDSiVLO5DJAXCR2aZQYHqNmWHXkGDxXZX2n7imIrMSqeSdKr/BcClOxd4tRszc0vJSDdOp8soBx+UnX3J7LrbqywwMKavKH6pDyJzk8q/SsOqCCHp5cAV2ddUTP6QpwYslio6c7dk1OzYsGGd86PN4cw8c1ea/ZAyW2AORqE8a/5NHD6iQl6lg0epBW2VWzuwlhRW9ZRVOhAU9yahZ40fMyqOU+1kmue2hJQy5zDFgwBlRlvye77nE3MfUC1jjZxxfsHeZuaJy3AhZzrlbmY6Q8oicGOS2r2BWLvkZ2z4VA8SJVhJaUXVRleyM598RIi97izUYPq72yvtf0/Z4Ss2TtuNCxA6zsLzS6f4jZhMZ0p+JGya6akVU+VSdRb01D02Kk1z0Sr8OCmjGiQAM6LGnyhkZrDBouvczH8yfVsPHj+ZNuzbHDaSyr9lctA572OqwV9hY2y3ihIaXTzNmC6Pa2cHDPFMZ9vsbG5J5dSvZ+j0j36GHchbon5jlD94xX8ePi3y/+Ah0J3OwVVy+4AAAAAElFTkSuQmCC",
  "business-y": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATsAAAE7AQMAAACYErSEAAAABlBMVEUQKDv///9wlIYjAAACk0lEQVR42u1asZGEMAwUT3DhlXClUJpdGqVcCYQEjPXSag3cfPLz4ctOGMDRjrTalST6u/OWcXFc/HnxED/T8dD3wm+lzbq9Vvv32PDX/n3JL8+/uugQOCaToQRA5KlaDRCDpxhm28t+HqnhsQgpk+6Gi4qFjcdSvAGeNSIrOTyeY0iuDoiu0mTAc0aPv7XZH4Ufb2Bl5x4gUZqzsIOFA4bOzj29cp1k/PHIXrl4vGStIvP+tPpO7jGiPhVAZu5ZqkQeBUNXko6isNeWW/d4HoUeRPRE2JCJNtJT4uQCv3hWSQl4DBcXicCMOZa7ciGdZFHq5DZTJO7ib6mTS4yM6wQ3YQeAoMw7Zki1KTM1K7IqTCjU4asLntoQPTW7JfXo8QhZVGaaLRGULEZWcmpePF4cJbBwtDdoSa3MJ+cekV7RCxy7o8QC5hZDWm7VHNIP6RRkXOTCJapa8ugJx26FHY2eqhTPUc7anL1ysb6rdMe+36BLLQv17A++w2xd3Z94lPS6xypX1HC4rAVKR9fTjx3JVTMjxOXP7mYLnQzv9wRmc25q7i5rZaoVjawanov9HoXninjR9aTmqGPpe81rN+4tZCF9KqNnGtwTbCNsxevNma6SvaHBXjMs6dUAW1Q53UltKiCXJQZcNxsBJvLEK9nh6dWJOtm5BwsJ0zE8V+/3hLeIEQW8BQcW2T0XTAWtOvqD0MlopsbaxjAV7IMBHk69rivJu4UxJQXbsOXcwlTooOaPGTtzTLD+BLm80YGl3w57RF8DqpkDi5uiTr/fEysrXHgK/z7aYdd2WAwlwMlXD17Ynx/w9JnNbbeQhmNspmqwTYWGZnIJBxYlezsMlQsKkBOcvqcq8swOz9iKHxf/evEb4UffwSw+TG0AAAAASUVORK5CYII=",
};

export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function inrDec(n: number): string {
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Convert a number in INR to words (Indian numbering system: Crore, Lakh, Thousand) */
export function numberToWordsINR(num: number): string {
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function underHundred(n: number): string {
    return n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  }

  function underThousand(n: number): string {
    if (n < 100) return underHundred(n);
    return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + underHundred(n % 100) : "");
  }

  let n = Math.round(num);
  if (!n) return "Zero";
  let out = "";
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;

  if (crore) out += underThousand(crore) + " Crore ";
  if (lakh) out += underThousand(lakh) + " Lakh ";
  if (thousand) out += underThousand(thousand) + " Thousand ";
  if (n) out += underThousand(n);
  return out.trim();
}

export type InvoiceEntry = {
  date: string;
  billNo: string;
  planName: string;
  amount: number;
  status: "Paid" | "Pending" | "Due";
};

export type BillingProfile = {
  shopName: string;
  legalName?: string;
  contactPerson?: string;
  mobile: string;
  email?: string;
  businessType?: string;
  address?: string;
  area?: string;
  city?: string;
  pinCode?: string;
  state?: string;
  gstin?: string;
  pan?: string;
};
