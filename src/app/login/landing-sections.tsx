"use client";

import { useState } from "react";
import Image from "next/image";
import "./landing.css";
import { DEMO_TARGET, DEMO_URL } from "./demo-link";
import { HeritageFooter } from "./heritage-footer";
import { DEFAULT_PRICES, savePercent, type CyclePrices, type PriceTable } from "@/lib/plan-prices";

type Lang = "en" | "ta";
type T = { en: string; ta: string };
type BillingCycle = "monthly" | "quarterly" | "yearly";

interface PricingPlan {
  id: string;
  name: T;
  tagline: T;
  popular?: boolean;
  badge?: T;
  specs: { en: string[]; ta: string[] };
  features: { en: string[]; ta: string[] };
  cta: T;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: {
      en: "Starter",
      ta: "ஸ்டார்ட்டர் (Starter)",
    },
    tagline: {
      en: "Start campaigns and keep customer orders together.",
      ta: "பிரச்சாரங்களைத் தொடங்கி வாடிக்கையாளர் ஆர்டர்களை ஒன்றாக வையுங்கள்.",
    },
    specs: {
      en: [
        "2 WhatsApp numbers",
        "1 Staff login",
        "5 Campaigns per month*",
        "10 Active approved templates*",
      ],
      ta: [
        "2 வாட்ஸ்அப் எண்கள்",
        "1 பணியாளர் கணக்கு",
        "மாதம் 5 பிரச்சாரங்கள்*",
        "10 அனுமதிக்கப்பட்ட டெம்ப்ளேட்கள்*",
      ],
    },
    features: {
      en: [
        "Unlimited customer records, tags & segments",
        "WhatsApp catalogue and order board",
        "UPI payment requests",
        "Overview business reports",
        "Official WhatsApp setup & onboarding",
        "Ticket support",
      ],
      ta: [
        "வரம்பற்ற வாடிக்கையாளர் பதிவுகள், குறிச்சொற்கள் & பிரிவுகள்",
        "வாட்ஸ்அப் கேட்லாக் மற்றும் ஆர்டர் போர்டு",
        "UPI பேமெண்ட் கோரிக்கைகள்",
        "வணிக மேலோட்ட அறிக்கைகள் (Overview)",
        "அதிகாரப்பூர்வ வாட்ஸ்அப் அமைப்பு & பயிற்சி",
        "டிக்கெட் ஆதரவு",
      ],
    },
    cta: {
      en: "Request access ↗",
      ta: "அணுகல் கோர ↗",
    },
  },
  {
    id: "growth",
    name: {
      en: "Growth",
      ta: "வளர்ச்சி (Growth)",
    },
    popular: true,
    badge: {
      en: "RECOMMENDED · MOST POPULAR",
      ta: "பரிந்துரைக்கப்படுகிறது · அதிகம் தேர்வு",
    },
    tagline: {
      en: "Follow up on orders and understand repeat customers.",
      ta: "ஆர்டர்களைப் பின்தொடர்ந்து வாடிக்கையாளர்களை மீண்டும் வரவழையுங்கள்.",
    },
    specs: {
      en: [
        "3 WhatsApp numbers",
        "3 Staff logins",
        "20 Campaigns per month*",
        "50 Active approved templates*",
      ],
      ta: [
        "3 வாட்ஸ்அப் எண்கள்",
        "3 பணியாளர் கணக்குகள்",
        "மாதம் 20 பிரச்சாரங்கள்*",
        "50 அனுமதிக்கப்பட்ட டெம்ப்ளேட்கள்*",
      ],
    },
    features: {
      en: [
        "Everything in Starter, plus:",
        "Auto payment requests + reminders + COD tracking",
        "Packing lists and order slips (print/image)",
        "Loyalty points, tiers and checkout",
        "Refill reminders and win-back messages",
        "Overview + Customers business reports",
        "Ticket + Email priority support",
      ],
      ta: [
        "ஸ்டார்ட்டரில் உள்ள அனைத்தும் +",
        "தானியங்கி பேமெண்ட் கோரிக்கைகள் + நினைவூட்டல் + COD",
        "பேக்கிங் பட்டியல் & ஆர்டர் ஸ்லிப்கள் (பிரிண்ட்/படம்)",
        "லாயல்டி புள்ளிகள், அடுக்குகள் & செக்அவுட்",
        "மறுஆர்டர் நினைவூட்டல் & வாடிக்கையாளர் மீட்பு",
        "மேலோட்டம் + வாடிக்கையாளர் அறிக்கைகள்",
        "டிக்கெட் + மின்னஞ்சல் முன்னுரிமை ஆதரவு",
      ],
    },
    cta: {
      en: "Get started ↗",
      ta: "தொடங்குங்கள் ↗",
    },
  },
  {
    id: "business",
    name: {
      en: "Business",
      ta: "பிசினஸ் (Business)",
    },
    tagline: {
      en: "Give a larger team complete reports and more capacity.",
      ta: "முழு குழுவிற்கும் முழுமையான அறிக்கைகளையும் கூடுதல் திறனையும் கொடுங்கள்.",
    },
    specs: {
      en: [
        "5 WhatsApp numbers",
        "5 Staff logins",
        "50 Campaigns per month*",
        "100 Active approved templates*",
      ],
      ta: [
        "5 வாட்ஸ்அப் எண்கள்",
        "5 பணியாளர் கணக்குகள்",
        "மாதம் 50 பிரச்சாரங்கள்*",
        "100 அனுமதிக்கப்பட்ட டெம்ப்ளேட்கள்*",
      ],
    },
    features: {
      en: [
        "Everything in Growth, plus:",
        "Complete reports: Overview, Campaigns, Customers + Products",
        "Excel / Google Sheets business-data export",
        "Browser WebRTC WhatsApp calling",
        "Logo, colours and custom order fields",
        "Ticket + Email + Call direct support",
      ],
      ta: [
        "வளர்ச்சித் திட்டத்தில் உள்ள அனைத்தும் +",
        "முழுமையான அறிக்கைகள்: மேலோட்டம், பிரச்சாரங்கள், வாடிக்கையாளர்கள் + தயாரிப்புகள்",
        "எக்செல் / கூகுள் ஷீட்ஸ் வணிகத் தரவு ஏற்றுமதி",
        "உலாவி நேரடி வாட்ஸ்அப் வாய்ஸ் கால்கள்",
        "லோகோ, வண்ணங்கள் & தனிப்பயன் ஆர்டர் புலங்கள்",
        "டிக்கெட் + மின்னஞ்சல் + தொலைபேசி நேரடி ஆதரவு",
      ],
    },
    cta: {
      en: "Contact sales ↗",
      ta: "தொடர்பு கொள்ள ↗",
    },
  },
];

/* ── Full Feature Comparison Rows (Matching Page 2 of Official Pricing PDF) ── */
interface FeatureRow {
  name: T;
  starter: string;
  growth: string;
  business: string;
}

const FEATURE_COMPARISON: FeatureRow[] = [
  {
    name: { en: "WhatsApp numbers", ta: "வாட்ஸ்அப் எண்கள்" },
    starter: "2",
    growth: "3",
    business: "5",
  },
  {
    name: { en: "Staff logins", ta: "பணியாளர் கணக்குகள்" },
    starter: "1",
    growth: "3",
    business: "5",
  },
  {
    name: { en: "Campaigns per month*", ta: "மாதம் பிரச்சாரங்கள்*" },
    starter: "5",
    growth: "20",
    business: "50",
  },
  {
    name: { en: "Active approved templates*", ta: "அனுமதிக்கப்பட்ட டெம்ப்ளேட்கள்*" },
    starter: "10",
    growth: "50",
    business: "100",
  },
  {
    name: { en: "Customer records, tags, areas and segments", ta: "வாடிக்கையாளர் பதிவுகள், குறிச்சொற்கள் & பிரிவுகள்" },
    starter: "Unlimited",
    growth: "Unlimited",
    business: "Unlimited",
  },
  {
    name: { en: "WhatsApp catalogue and order board", ta: "வாட்ஸ்அப் கேட்லாக் மற்றும் ஆர்டர் போர்டு" },
    starter: "Included",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "UPI payment requests", ta: "UPI பேமெண்ட் கோரிக்கைகள்" },
    starter: "Included",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "Auto payment requests + reminders + COD tracking", ta: "தானியங்கி பேமெண்ட் கோரிக்கைகள் + நினைவூட்டல் + COD" },
    starter: "—",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "Packing lists and order slips (print/image)", ta: "பேக்கிங் பட்டியல் & ஆர்டர் ஸ்லிப்கள் (பிரிண்ட்/படம்)" },
    starter: "—",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "Loyalty points, tiers and checkout", ta: "லாயல்டி புள்ளிகள், அடுக்குகள் & செக்அவுட்" },
    starter: "—",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "Refill reminders and win-back messages", ta: "மறுஆர்டர் நினைவூட்டல் & வாடிக்கையாளர் மீட்பு" },
    starter: "—",
    growth: "Included",
    business: "Included",
  },
  {
    name: { en: "Business reports", ta: "வணிக அறிக்கைகள்" },
    starter: "Overview only",
    growth: "Overview + Customers",
    business: "Overview, Campaigns, Customers + Products",
  },
  {
    name: { en: "Excel / Google Sheets business-data export", ta: "Excel / Google Sheets வணிகத் தரவு ஏற்றுமதி" },
    starter: "—",
    growth: "—",
    business: "Included",
  },
  {
    name: { en: "WhatsApp calling (WebRTC)", ta: "உலாவி நேரடி வாட்ஸ்அப் வாய்ஸ் கால்கள்" },
    starter: "—",
    growth: "—",
    business: "Included",
  },
  {
    name: { en: "Logo, colours and custom order fields", ta: "லோகோ, வண்ணங்கள் & தனிப்பயன் ஆர்டர் புலங்கள்" },
    starter: "—",
    growth: "—",
    business: "Included",
  },
  {
    name: { en: "Support system", ta: "ஆதரவு அமைப்பு" },
    starter: "Ticket",
    growth: "Ticket + email",
    business: "Ticket + email + call",
  },
];

/* ── Competitor Comparison Rows (Matching Page 4 of Official Pricing PDF) ── */
interface CompetitorRow {
  platform: string;
  isThabaal?: boolean;
  price: T;
}

const COMPETITOR_COMPARISON: CompetitorRow[] = [
  {
    platform: "Thabaal",
    isThabaal: true,
    price: {
      en: "INR {starter} / {growth} / {business} monthly, GST included",
      ta: "மாதம் ₹{starter} / ₹{growth} / ₹{business}, GST உட்பட",
    },
  },
  {
    platform: "AiSensy",
    price: {
      en: "Basic INR 1,500; Pro INR 3,200 monthly",
      ta: "பேஸிக் ₹1,500; ப்ரோ ₹3,200 மாதம்",
    },
  },
  {
    platform: "Gallabox",
    price: {
      en: "Basic INR 2,399 monthly, billed annually",
      ta: "பேஸிக் ₹2,399 மாதம், வருடாந்திர கட்டணம்",
    },
  },
  {
    platform: "Wati",
    price: {
      en: "Regional pricing changes; check current quote",
      ta: "பிராந்திய விலை மாற்றம்; தற்போதைய மதிப்பீட்டைப் பார்க்கவும்",
    },
  },
  {
    platform: "Interakt",
    price: {
      en: "Get current India price",
      ta: "தற்போதைய இந்திய விலையைப் பெறவும்",
    },
  },
  {
    platform: "DoubleTick",
    price: {
      en: "Plans listed; request a current quote",
      ta: "திட்டங்கள் பட்டியலிடப்பட்டுள்ளன; விலை கேட்க வேண்டும்",
    },
  },
];

const TALK = DEMO_URL;
const MAILTO_ORDER = "mailto:thabaal26@gmail.com?subject=Show%20me%20Thabaal%20order%20tracking";
const MAILTO_TEMPLATE = "mailto:thabaal26@gmail.com?subject=Show%20me%20Thabaal%20templates";
const MAILTO_DEMO = "mailto:thabaal26@gmail.com?subject=Thabaal%20demo%20request";
const TEL_PHONE = "tel:+916379140626";

/* ── 1. Analytics & Reports Datasets (Matches Exact HTML Script) ── */
interface DemoDataset {
  title: T;
  copy: T;
  metrics: { label: T; value: string; tone?: "default" | "mint" | "cream" | "lavender" }[];
  action: T;
}

const DEMO_DATA: Record<"overview" | "campaign" | "payments", DemoDataset> = {
  overview: {
    title: {
      en: "Your campaign, in business language",
      ta: "உங்கள் பிரச்சாரம், எளிய வணிக மொழியில்",
    },
    copy: {
      en: "What customers saw, what happened next and what you spent.",
      ta: "வாடிக்கையாளர்கள் என்ன பார்த்தார்கள், அடுத்து என்ன நடந்தது, என்ன செலவானது.",
    },
    metrics: [
      { label: { en: "Customers reached", ta: "சென்றடைந்தது" }, value: "820", tone: "default" },
      { label: { en: "Customers who read", ta: "படித்தவர்கள்" }, value: "610", tone: "mint" },
      { label: { en: "Orders recorded", ta: "வந்த ஆர்டர்கள்" }, value: "28", tone: "cream" },
      { label: { en: "Message spend", ta: "செய்திச் செலவு" }, value: "₹500", tone: "lavender" },
    ],
    action: {
      en: "Compare attention, orders and spend before deciding your next move.",
      ta: "அடுத்த முடிவை எடுப்பதற்கு முன் வாடிக்கையாளர் கவனம், ஆர்டர்கள் மற்றும் செலவை ஒப்பிட்டுப் பாருங்கள்.",
    },
  },
  campaign: {
    title: {
      en: "Interest to sale",
      ta: "விருப்பத்திலிருந்து விற்பனை வரை",
    },
    copy: {
      en: "Follow the customer journey without drowning in charts.",
      ta: "வரைபடக் குழப்பங்களின்றி வாடிக்கையாளர் பயணத்தைத் தொடருங்கள்.",
    },
    metrics: [
      { label: { en: "Replies", ta: "பதில்கள்" }, value: "42", tone: "default" },
      { label: { en: "Carts started", ta: "கார்ட்டுகள்" }, value: "31", tone: "mint" },
      { label: { en: "Paid orders", ta: "செலுத்தப்பட்டவை" }, value: "28", tone: "cream" },
      { label: { en: "Sales recorded", ta: "விற்பனை" }, value: "₹18,600", tone: "lavender" },
    ],
    action: {
      en: "Spot where interest is strong and where customers may need help.",
      ta: "எங்கு ஆர்வம் அதிகம், வாடிக்கையாளர்களுக்கு எங்கு உதவி தேவை என்பதைக் கண்டறியுங்கள்.",
    },
  },
  payments: {
    title: {
      en: "Orders in motion",
      ta: "செயல்பாட்டில் உள்ள ஆர்டர்கள்",
    },
    copy: {
      en: "Know what your team needs to prepare, dispatch and complete.",
      ta: "உங்கள் குழு எதைத் தயாரிக்க வேண்டும், அனுப்ப வேண்டும் என்பதைத் தெளிவாக அறியுங்கள்.",
    },
    metrics: [
      { label: { en: "New", ta: "புதியவை" }, value: "12", tone: "default" },
      { label: { en: "Confirmed", ta: "உறுதியானவை" }, value: "8", tone: "mint" },
      { label: { en: "Dispatched", ta: "அனுப்பியவை" }, value: "6", tone: "cream" },
      { label: { en: "Delivered", ta: "சேர்ந்தவை" }, value: "19", tone: "lavender" },
    ],
    action: {
      en: "Follow the next step instead of searching through messages.",
      ta: "செய்திகளில் தேடாமல் அடுத்த கட்ட நடவடிக்கையைப் பின்பற்றுங்கள்.",
    },
  },
};

/* ── FAQ icons (inline SVG, no extra dependency) ── */
type FaqIconKey = "coins" | "whatsapp" | "gear" | "phone" | "document" | "bag" | "plus" | "chart";
type FaqTone = "gold" | "green" | "blue" | "purple" | "teal" | "orange" | "pink" | "indigo";

const WHATSAPP_GLYPH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

function WhatsAppGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={WHATSAPP_GLYPH} />
    </svg>
  );
}

function FaqIcon({ name }: { name: FaqIconKey }) {
  if (name === "whatsapp") return <WhatsAppGlyph size={20} />;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "coins" && (
        <>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </>
      )}
      {name === "gear" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </>
      )}
      {name === "phone" && (
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
      )}
      {name === "document" && (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="m9 15 2 2 4-4" />
        </>
      )}
      {name === "bag" && (
        <>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </>
      )}
      {name === "plus" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <path d="M12 8v8M8 12h8" />
        </>
      )}
      {name === "chart" && (
        <>
          <path d="M3 3v18h18" />
          <path d="M8 16v-4M13 16V8M18 16v-7" />
        </>
      )}
    </svg>
  );
}

/* ── 2. Frequently Asked Questions (Exact Match HTML #faq) ── */
const FAQ_ITEMS: { icon: FaqIconKey; tone: FaqTone; q: T; a: T }[] = [
  {
    icon: "coins",
    tone: "gold",
    q: {
      en: "How much does Thabaal cost?",
      ta: "தபாலின் கட்டணம் எவ்வளவு?",
    },
    a: {
      en: "Thabaal has three plans: Starter at INR {starter}, Growth at INR {growth} and Business at INR {business} per month, all with GST included. Quarterly billing saves {qsave}% and yearly billing saves {ysave}%.",
      ta: "தபாலில் மூன்று திட்டங்கள் உள்ளன: ஸ்டார்ட்டர் மாதம் ₹{starter}, வளர்ச்சி ₹{growth}, பிசினஸ் ₹{business}—அனைத்தும் GST உள்ளிட்டவை. காலாண்டு கட்டணத்தில் {qsave}%, வருடாந்திர கட்டணத்தில் {ysave}% சேமிக்கலாம்.",
    },
  },
  {
    icon: "whatsapp",
    tone: "green",
    q: {
      en: "Do you add to Meta’s WhatsApp message rate?",
      ta: "மெட்டாவின் வாட்ஸ்அப் செய்திக் கட்டணத்தில் கூடுதல் கட்டணம் சேர்க்கிறீர்களா?",
    },
    a: {
      en: "No—not one paisa. Meta’s official message charges pass through without a Thabaal markup; your Thabaal plan fee is separate.",
      ta: "இல்லை—ஒரு பைசா கூட இல்லை. மெட்டாவின் அதிகாரப்பூர்வ செய்திக் கட்டணங்கள் தபாலின் கூடுதல் லாபம் எதுவுமின்றி நேரடியாக கணக்கிடப்படுகின்றன; தபால் மென்பொருள் திட்டக் கட்டணம் மட்டுமே தனியானது.",
    },
  },
  {
    icon: "gear",
    tone: "blue",
    q: {
      en: "Is there a setup fee?",
      ta: "செட்டப் கட்டணம் உள்ளதா?",
    },
    a: {
      en: "Official WhatsApp setup and onboarding is free on Quarterly and Yearly plans. On the Monthly plan it is a one-time INR 299.",
      ta: "அதிகாரப்பூர்வ வாட்ஸ்அப் செட்டப் மற்றும் ஆன்போர்டிங் காலாண்டு, வருடாந்திர திட்டங்களில் இலவசம். மாதாந்திர திட்டத்தில் ஒருமுறை ₹299 மட்டும்.",
    },
  },
  {
    icon: "phone",
    tone: "purple",
    q: {
      en: "Can I use my existing WhatsApp number?",
      ta: "என் ஏற்கனவே உள்ள வாட்ஸ்அப் எண்ணைப் பயன்படுத்தலாமா?",
    },
    a: {
      en: "Yes. Your number can be moved onto the official WhatsApp Business API through Thabaal. Once moved, it runs through Thabaal and no longer works in the regular WhatsApp app.",
      ta: "ஆம். உங்கள் எண்ணை தபால் மூலம் அதிகாரப்பூர்வ வாட்ஸ்அப் பிசினஸ் API-க்கு மாற்றலாம். மாற்றிய பிறகு அது தபால் வழியாகவே இயங்கும்; வழக்கமான வாட்ஸ்அப் செயலியில் இனி வேலை செய்யாது.",
    },
  },
  {
    icon: "document",
    tone: "teal",
    q: {
      en: "Who approves WhatsApp templates?",
      ta: "வாட்ஸ்அப் டெம்ப்ளேட்டுகளை யார் அங்கீகரிப்பது?",
    },
    a: {
      en: "Meta reviews and decides template approval. Thabaal helps you prepare and submit a template and see whether it is in review or approved.",
      ta: "மெட்டா நிறுவனமே டெம்ப்ளேட்டுகளை மதிப்பாய்வு செய்து ஒப்புதல் அளிக்கிறது. டெம்ப்ளேட்டைத் தயாரித்து சமர்ப்பிக்கவும், அது பரிசீலனையில் உள்ளதா அல்லது ஒப்புதல் பெற்றுள்ளதா என்பதைப் பார்க்கவும் தபால் உதவுகிறது.",
    },
  },
  {
    icon: "bag",
    tone: "orange",
    q: {
      en: "Can I follow orders from my catalogue?",
      ta: "எனது கேட்லாக்கிலிருந்து வரும் ஆர்டர்களைப் பின்தொடர முடியுமா?",
    },
    a: {
      en: "Yes. Thabaal brings catalogue products and customer orders together, with order, payment and fulfilment progress you can follow.",
      ta: "ஆம். கேட்லாக் தயாரிப்புகளையும் வாடிக்கையாளர் ஆர்டர்களையும் தபால் ஒன்றாக இணைக்கிறது; ஆர்டர், பேமெண்ட் மற்றும் டெலிவரி முன்னேற்றத்தை எளிதாகப் பின்தொடரலாம்.",
    },
  },
  {
    icon: "plus",
    tone: "pink",
    q: {
      en: "Can I add more staff logins or WhatsApp numbers?",
      ta: "கூடுதல் பணியாளர் கணக்குகள் அல்லது வாட்ஸ்அப் எண்கள் சேர்க்கலாமா?",
    },
    a: {
      en: "Yes. Extra staff logins are INR 499 per seat per month, and extra WhatsApp numbers for branches or support lines are INR 599 per number per month.",
      ta: "ஆம். கூடுதல் பணியாளர் கணக்கு ஒன்றுக்கு மாதம் ₹499, கிளைகள் அல்லது ஆதரவு எண்களுக்கான கூடுதல் வாட்ஸ்அப் எண் ஒன்றுக்கு மாதம் ₹599.",
    },
  },
  {
    icon: "chart",
    tone: "indigo",
    q: {
      en: "How do analytics help my business?",
      ta: "அறிக்கைகள் எனது வணிகத்திற்கு எவ்வாறு உதவுகின்றன?",
    },
    a: {
      en: "They put message reach, customer response, orders, recorded sales and message spend in one understandable view. Use that picture to improve your next offer and decide where to spend—not as a guarantee that every sale came from a message.",
      ta: "செய்தி சென்றடைந்தது, வாடிக்கையாளர் பதில்கள், ஆர்டர்கள், விற்பனை மற்றும் செய்திச் செலவு ஆகியவற்றை ஒரே எளிய பார்வையில் வைக்கின்றன. அடுத்த சலுகையை மேம்படுத்தவும், எங்கு செலவிட வேண்டும் என்பதைத் தீர்மானிக்கவும் இந்த விவரங்களைப் பயன்படுத்துங்கள்.",
    },
  },
];

/** The first four questions stay visible; the rest sit behind the "more questions" button. */
const FAQ_PRIMARY_COUNT = 4;

const fmtInr = (n: number) => n.toLocaleString("en-IN");

/** Percent saved on 3 or 12 months: "10" when every plan saves the same, "8–10" when they differ. */
function saveRange(prices: PriceTable, cycle: "q" | "y") {
  const all = Object.values(prices).map((p) => savePercent(p, cycle));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return lo === hi ? String(hi) : `${lo}–${hi}`;
}

/** Fills {starter} {growth} {business} (monthly prices) and {qsave} {ysave} from the prices in force. */
function fillPrices(text: string, prices: PriceTable) {
  return text.replace(/\{(starter|growth|business|qsave|ysave)\}/g, (_, k: string) =>
    k === "qsave" ? saveRange(prices, "q") : k === "ysave" ? saveRange(prices, "y") : fmtInr(prices[k as keyof PriceTable].m),
  );
}

/** The price box on a plan card: the rate per month for the cycle, and what is billed. */
function priceInfoOf(p: CyclePrices, cycle: BillingCycle): { monthlyRate: string; billedNote: T } {
  if (cycle === "monthly") return { monthlyRate: fmtInr(p.m), billedNote: { en: `INR ${fmtInr(p.m)} per month, GST included`, ta: `மாதம் ₹${fmtInr(p.m)}, GST உட்பட` } };
  const c = cycle === "quarterly" ? "q" : "y";
  const save = savePercent(p, c);
  const tail = save > 0 ? { en: ` (Save ${save}%)`, ta: ` (${save}% சேமிப்பு)` } : { en: "", ta: "" };
  return {
    monthlyRate: fmtInr(Math.round(p[c] / (c === "q" ? 3 : 12))),
    billedNote:
      c === "q"
        ? { en: `Quarterly total: INR ${fmtInr(p.q)}${tail.en}`, ta: `காலாண்டு மொத்தம்: ₹${fmtInr(p.q)}${tail.ta}` }
        : { en: `Yearly total: INR ${fmtInr(p.y)}${tail.en}`, ta: `வருடாந்திர மொத்தம்: ₹${fmtInr(p.y)}${tail.ta}` },
  };
}

/** `prices`: the plan prices in force (Settings › Plans and prices), read on the server. */
export function LandingSections({ lang, prices = DEFAULT_PRICES }: { lang: Lang; prices?: PriceTable }) {
  const ta = lang === "ta";
  const [activeDemo, setActiveDemo] = useState<"overview" | "campaign" | "payments">("overview");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showMoreFaq, setShowMoreFaq] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [pricingTab, setPricingTab] = useState<"plans" | "features" | "addons" | "compare">("plans");

  const demo = DEMO_DATA[activeDemo];

  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  };

  const renderFaq = (item: (typeof FAQ_ITEMS)[number], idx: number) => {
    const isOpen = openFaq === idx;
    return (
      <div key={idx} className={`faq-item faq-tone-${item.tone} ${isOpen ? "open" : ""}`}>
        <h3 className="faq-q-heading">
          <button
            type="button"
            id={`faq-q-${idx}`}
            className="faq-question"
            onClick={() => toggleFaq(idx)}
            aria-expanded={isOpen}
            aria-controls={`faq-a-${idx}`}
          >
            <span className="faq-icon" aria-hidden="true">
              <FaqIcon name={item.icon} />
            </span>
            <span className="faq-q-text">{item.q[lang]}</span>
            <span className="faq-toggle-icon" aria-hidden="true" />
          </button>
        </h3>
        <div
          id={`faq-a-${idx}`}
          role="region"
          aria-labelledby={`faq-q-${idx}`}
          className="faq-answer-wrap"
        >
          <div className="faq-answer">
            <p>{fillPrices(item.a[lang], prices)}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tl-root" id="explore">
      {/* ── 1. FLIGHT PATH SIGNATURE RIBBON (Design 2 — Iconic Flow) ── */}
      <section className="business-ribbon" aria-label={ta ? "வணிக வழிகாட்டி" : "Business positioning"}>
        {/* Understated atmospheric clouds framing the edges */}
        <div className="ribbon__clouds" aria-hidden="true">
          <svg className="ribbon__cloud ribbon__cloud--left" viewBox="0 0 360 120" preserveAspectRatio="none" focusable="false">
            <path
              fill="currentColor"
              d="M 0 120 L 0 80 C 15 55, 55 45, 80 62 C 105 32, 160 20, 195 48 C 225 35, 265 42, 280 68 C 298 64, 325 74, 335 94 C 345 105, 355 115, 360 120 Z"
            />
          </svg>
          <svg className="ribbon__cloud ribbon__cloud--right" viewBox="0 0 360 120" preserveAspectRatio="none" focusable="false">
            <path
              fill="currentColor"
              d="M 360 120 L 360 78 C 342 54, 305 46, 280 64 C 255 30, 198 18, 162 46 C 132 32, 92 40, 78 66 C 58 62, 32 72, 22 92 C 12 104, 4 114, 0 120 Z"
            />
          </svg>
        </div>

        <div className="ribbon__container">
          {/* 1. Authentic Upper Brand Bird Mark */}
          <div className="ribbon__brand-mark" aria-hidden="true">
            <Image
              src="/brands/thabaal/mark.png"
              alt="Thabaal"
              width={46}
              height={26}
              priority
              style={{ width: "46px", height: "auto" }}
            />
          </div>

          {/* 2. Centered Typography */}
          <div className="ribbon__copy-group">
            <h3 className="ribbon__title">
              {ta ? "தமிழ்நாடு வணிகங்களுக்காக உருவாக்கப்பட்டது." : "Made for the way business happens in Tamil Nadu."}
            </h3>
            <p className="ribbon__description">
              {ta
                ? "மார்க்கெட்டிங் படிப்பு தேவையின்றி வாடிக்கையாளர்களைச் சென்றடைந்து, ஆர்டர்களைப் பின்தொடர்ந்து, முடிவுகளைப் புரிந்து கொள்ளுங்கள்."
                : "Reach customers, follow orders and understand results without a marketing degree."}
            </p>
          </div>

          {/* 3. Dotted Yellow Flight Path with Terminal Endpoint Bird */}
          <div className="ribbon__flight-path-wrap" aria-hidden="true">
            <svg
              viewBox="0 0 760 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="ribbon__flight-svg"
              preserveAspectRatio="xMidYMid meet"
              focusable="false"
            >
              <path
                d="M 20 46 C 80 36, 145 32, 210 36 C 280 40, 340 44, 400 42 C 470 39, 525 28, 580 27 C 618 26, 642 42, 668 47 C 688 51, 706 43, 712 30 C 716 16, 702 8, 688 8 C 672 8, 664 22, 674 34 C 682 44, 702 40, 724 30 L 738 22"
                stroke="#FFBF18"
                strokeWidth="2.2"
                strokeDasharray="6 7"
                strokeLinecap="round"
                className="ribbon__flight-line"
              />
              <circle cx="20" cy="46" r="3.4" fill="#FFBF18" />
              <circle cx="210" cy="36" r="3.2" fill="#FFBF18" />
              <circle cx="400" cy="42" r="3.2" fill="#FFBF18" />
              <circle cx="580" cy="27" r="3.2" fill="#FFBF18" />
            </svg>
            <div className="ribbon__endpoint-bird">
              <Image
                src="/brands/thabaal/mark.png"
                alt=""
                width={28}
                height={16}
                className="ribbon__mini-bird"
                aria-hidden="true"
                style={{ width: "28px", height: "auto" }}
              />
            </div>
          </div>

          {/* 4. Four Centered Category Pills */}
          <div className="ribbon__categories" role="list" aria-label={ta ? "வணிகப் பிரிவுகள்" : "Business categories"}>
            <span className="ribbon__category" role="listitem">{ta ? "சில்லறை வணிகம்" : "Retail"}</span>
            <span className="ribbon__category" role="listitem">{ta ? "உணவு" : "Food"}</span>
            <span className="ribbon__category" role="listitem">{ta ? "சேவைகள்" : "Services"}</span>
            <span className="ribbon__category" role="listitem">{ta ? "D2C" : "D2C"}</span>
          </div>
        </div>
      </section>

      {/* ── 2. THREE REASONS TO CHOOSE THABAAL (Exact Match HTML #features) ── */}
      <section className="workspace-section" id="features">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow">{ta ? "தபாலைத் தேர்வு செய்ய 3 காரணங்கள்" : "Three reasons to choose Thabaal"}</div>
            <h2>{ta ? "வாட்ஸ்அப் மார்க்கெட்டிங் வெறும் “சென்ட்” பொத்தானோடு முடிந்துவிடக்கூடாது." : "WhatsApp marketing should do more than press “send.”"}</h2>
            <p>
              {ta
                ? "செய்திச் செலவுகளைத் துல்லியமாக அறிந்து, வாடிக்கையாளர்கள் என்ன செய்தார்கள் என்பதைப் புரிந்து, யோசனையிலிருந்து மெட்டா ஒப்புதல் வரை தெளிவுடன் செயல்படுங்கள்."
                : "Know what your messages cost, understand what customers did next, and move from a message idea to Meta review with less guesswork."}
            </p>
          </div>

          <div className="usp-grid">
            {/* Card 1: Honest Message Costs */}
            <article className="usp-card cost">
              <span className="usp-kicker">{ta ? "01 · வெளிப்படையான செய்திக் கட்டணம்" : "01 · Honest message costs"}</span>
              <h3>{ta ? "மெட்டாவின் செய்திக் கட்டணத்தில் ஒரு பைசா கூட கூடுதல் இல்லை." : "Not one paisa extra on Meta’s message rate."}</h3>
              <p>
                {ta
                  ? "வாட்ஸ்அப் செய்திகளுக்கு மெட்டா நிர்ணயிக்கும் அதிகாரப்பூர்வ கட்டணம் மட்டுமே. தபால் திட்டக் கட்டணம் தனியாகக் காட்டப்படும்."
                  : "Whatever Meta charges for WhatsApp messages is what you pay for those messages through Thabaal. Your Thabaal plan fee is shown separately."}
              </p>
              <span className="zero-mark">
                ₹0 <small>{ta ? "கூடுதல் கட்டணம் இல்லை" : "message markup"}</small>
              </span>
              <div className="usp-foot">
                {ta ? "செய்தி வகை மற்றும் இலக்கைப் பொறுத்து மெட்டாவின் கட்டணம் மாறுபடும். " : "Meta’s rates vary by message category and destination. "}
                <a href="https://business.whatsapp.com/products/platform-pricing" target="_blank" rel="noopener noreferrer">
                  {ta ? "அதிகாரப்பூர்வ விலையைப் பார்க்க ↗" : "View official rates ↗"}
                </a>
              </div>
            </article>

            {/* Card 2: Marketing Analytics */}
            <article className="usp-card insight">
              <span className="usp-kicker">{ta ? "02 · மார்க்கெட்டிங் அறிக்கைகள்" : "02 · Marketing analytics"}</span>
              <h3>{ta ? "ஒவ்வொரு பிரச்சாரத்தின் பின்னாலும் இருக்கும் வணிக வெற்றியைப் பாருங்கள்." : "See the business story behind every campaign."}</h3>
              <p>
                {ta
                  ? "அனுப்பப்பட்ட மற்றும் படித்த எண்ணிக்கையைத் தாண்டி வாடிக்கையாளர் ஆர்வம், வந்த ஆர்டர்கள் மற்றும் செலவை ஒரே பார்வையில் புரிந்துகொள்ளுங்கள்."
                  : "Go beyond sent and read counts. Understand customer interest, orders, recorded sales and message spend in one clear view."}
              </p>
              <div className="mini-cycle">
                <span><b>1</b> {ta ? "பார்த்தார்களா?" : "Did customers see it?"}</span>
                <span><b>2</b> {ta ? "ஆர்டர்கள் வந்தனவா?" : "Did they place orders?"}</span>
                <span><b>3</b> {ta ? "செலவு பயனுள்ளதா?" : "Was the spend worthwhile?"}</span>
              </div>
            </article>

            {/* Card 3: Template Confidence */}
            <article className="usp-card templates">
              <span className="usp-kicker">{ta ? "03 · டெம்ப்ளேட் தெளிவு" : "03 · Template confidence"}</span>
              <h3>{ta ? "அனுப்ப எது தயார் என்பதைத் தெளிவாகத் தெரிந்துகொள்ளுங்கள்." : "Know what is ready to send."}</h3>
              <p>
                {ta
                  ? "செய்திகளை உருவாக்கி மாதிரி பார்த்து, மெட்டாவின் ஆய்வுக்கு அனுப்பி, அவற்றின் ஒப்புதல் நிலையை தபாலில் நேரடியாகக் கண்காணியுங்கள்."
                  : "Prepare and preview messages, submit them for Meta review, and follow their approval status in Thabaal."}
              </p>
              <div className="mini-template">
                <strong>{ta ? "பண்டிகை சலுகை செய்தி" : "Festival offer message"}</strong>
                <small>{ta ? "மார்க்கெட்டிங் டெம்ப்ளேட் · மாதிரி" : "Marketing template · Example"}</small>
                <em>{ta ? "✓ மெட்டா ஒப்புதல் பெற்றது" : "✓ Approved by Meta"}</em>
              </div>
              <div className="usp-foot">
                {ta ? "டெம்ப்ளேட் ஒப்புதலை மெட்டா மட்டுமே தீர்மானிக்கிறது." : "Meta decides whether a template is approved."}
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ── 3. ANALYTICS & REPORTS (Exact Match HTML #reports) ── */}
      <section className="demo-section" id="reports">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow eyebrow-yellow">{ta ? "வணிக உரிமையாளர்களுக்கான அறிக்கைகள்" : "Analytics made for business owners"}</div>
            <h2>{ta ? "உங்கள் மார்க்கெட்டிங் உண்மையான வணிகத்தைக் கொண்டு வந்ததா?" : "Did your marketing bring real business?"}</h2>
            <p>
              {ta
                ? "குழப்பமான வரைபடங்களுக்குப் பதிலாக, செய்திகள் சென்றடைந்தது முதல் வாடிக்கையாளர் பதில், ஆர்டர்கள், வந்த விற்பனை வரை வணிகப் பயணத்தை தபால் எளிதாக்குகிறது. அடுத்த பிரச்சாரத்தை புத்திசாலித்தனமாகத் திட்டமிட செலவையும் செயலையும் ஒப்பிட்டுப் பாருங்கள்."
                : "Instead of a wall of charts, Thabaal helps you follow the business cycle: messages reached customers, customers showed interest, orders came in, and sales were recorded. Compare that activity with what you spent to plan the next campaign more wisely."}
            </p>
          </div>

          <div className="analytics-questions">
            <span>{ta ? "மக்கள் பார்த்தார்களா?" : "Did people see it?"}</span>
            <span>{ta ? "என்ன வாங்கினார்கள்?" : "What did they buy?"}</span>
            <span>{ta ? "எவ்வளவு செலவானது?" : "How much did I spend?"}</span>
            <span>{ta ? "அடுத்து என்ன செய்ய வேண்டும்?" : "What should I try next?"}</span>
          </div>

          <div className="demo-layout">
            {/* 3 Tabs */}
            <div className="demo-tabs" role="tablist" aria-label={ta ? "முன்னோட்டப் பிரிவுகள்" : "Dashboard preview tabs"}>
              <button
                type="button"
                className={`demo-tab ${activeDemo === "overview" ? "active" : ""}`}
                onClick={() => setActiveDemo("overview")}
                role="tab"
                aria-selected={activeDemo === "overview"}
              >
                <strong>{ta ? "என் பிரச்சாரம் என்ன செய்தது?" : "What did my campaign do?"}</strong>
                <span>{ta ? "சென்றடைந்தது, பதில்கள், ஆர்டர்கள் மற்றும் செலவு" : "Reach, response, orders and spend"}</span>
              </button>

              <button
                type="button"
                className={`demo-tab ${activeDemo === "campaign" ? "active" : ""}`}
                onClick={() => setActiveDemo("campaign")}
                role="tab"
                aria-selected={activeDemo === "campaign"}
              >
                <strong>{ta ? "ஆர்வம் விற்பனையாக மாறியதா?" : "Did interest turn into sales?"}</strong>
                <span>{ta ? "பயணத்தின் அடுத்த கட்டத்தைப் புரிந்துகொள்ளுங்கள்" : "Understand the next part of the journey"}</span>
              </button>

              <button
                type="button"
                className={`demo-tab ${activeDemo === "payments" ? "active" : ""}`}
                onClick={() => setActiveDemo("payments")}
                role="tab"
                aria-selected={activeDemo === "payments"}
              >
                <strong>{ta ? "என் ஆர்டர்கள் எங்கே?" : "Where are my orders?"}</strong>
                <span>{ta ? "அடுத்து கவனிக்க வேண்டியதைப் பாருங்கள்" : "See what needs attention next"}</span>
              </button>
            </div>

            {/* Dynamic Result Panel */}
            <div className="demo-panel" role="tabpanel" key={activeDemo}>
              <div className="demo-panel-top">
                <div>
                  <h3>{demo.title[lang]}</h3>
                  <p>{demo.copy[lang]}</p>
                </div>
                <span className="demo-period">{ta ? "மாதிரி பார்வை" : "Sample view"}</span>
              </div>

              <div className="demo-metrics">
                {demo.metrics.map((m, idx) => (
                  <div key={idx} className="demo-metric">
                    <small>{m.label[lang]}</small>
                    <strong>{m.value}</strong>
                  </div>
                ))}
              </div>

              <div className="demo-message">
                <div className="demo-message-icon" aria-hidden="true">→</div>
                <div>
                  <strong>{demo.action[lang]}</strong>
                  <span>
                    {ta
                      ? "மாதிரி புள்ளிவிவரங்கள் மட்டுமே; செய்திக்குப் பின் வரும் ஆர்டர்கள் அனைத்தும் செய்தியால் மட்டுமே வந்ததாகக் கருத முடியாது."
                      : "Illustrative figures only; orders after a message do not prove the message caused the sale."}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Bottom Analytics Value Cards */}
          <div className="analytics-decisions">
            <div className="analytics-decision">
              <b>{ta ? "சிறந்த சலுகைகளைத் திட்டமிடுங்கள்" : "Plan better offers"}</b>
              <span>
                {ta
                  ? "எந்தப் பிரச்சாரங்கள் அதிகக் கவனம் பெறுகின்றன, எதற்கு புதிய அணுகுமுறை தேவை என்பதைப் பாருங்கள்."
                  : "See which campaigns are getting attention and which need a different message."}
              </span>
            </div>
            <div className="analytics-decision">
              <b>{ta ? "உங்கள் லாபத்தைப் பாதுகாக்கவும்" : "Protect your margins"}</b>
              <span>
                {ta
                  ? "செய்திச் செலவையும் வந்த விற்பனையையும் ஒப்பிட்டு, அடுத்த சலுகையை அனுப்பும் முன் லாபத்தைக் கணக்கிடுங்கள்."
                  : "Compare message cost with recorded sales, then factor in your own product costs before repeating an offer."}
              </span>
            </div>
            <div className="analytics-decision">
              <b>{ta ? "வாய்ப்புகளைத் தவறவிடாதீர்கள்" : "Spot missed opportunities"}</b>
              <span>
                {ta
                  ? "ஆர்வமிருந்தும் இன்னும் ஆர்டராக மாறாத வாடிக்கையாளர்களை உடனடியாகக் கண்டறிந்து அணுகுங்கள்."
                  : "Notice interest that has not yet turned into a completed order."}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. ORDERS & CATALOGUE (Exact Match HTML #how-it-works) ── */}
      <section className="steps-section" id="how-it-works">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow">{ta ? "வெறும் அறிவிப்புகளுக்கு அப்பால்" : "Beyond broadcasting"}</div>
            <h2>{ta ? "உங்கள் பொருட்கள் ஆர்டர்களாக மாறலாம். உங்கள் ஆர்டர்கள் எங்கும் மறையக்கூடாது." : "Your products can lead to orders. Your orders should never disappear."}</h2>
            <p>
              {ta
                ? "உங்கள் வணிகக் கேட்லாக்கில் உள்ள பொருட்களையும், வாடிக்கையாளர்கள் வைக்கும் ஆர்டர்களையும் தபால் ஒன்றாக இணைக்கிறது; பேமெண்ட், பேக்கிங் மற்றும் டெலிவரியை ஒரே இடத்தில் கண்காணிக்கலாம்."
                : "Thabaal brings together the products you publish in your business catalogue and the orders customers place, so your team can follow each order through payment, packing and delivery."}
            </p>
          </div>

          <div className="order-story">
            <div className="order-story-copy">
              <span className="eyebrow eyebrow-yellow">{ta ? "கேட்லாக் → வாடிக்கையாளர் → ஆர்டர்" : "Catalogue → Customer → Order"}</span>
              <h3>{ta ? "என்ன விற்றது என்பதைத் தெரிந்து கொள்ளுங்கள். அடுத்த படியை தெளிவாகப் பாருங்கள்." : "Know what sold. Know what happens next."}</h3>
              <p>
                {ta
                  ? "ஒரு செய்தி விற்பனையைத் தொடங்கலாம், ஆனால் வேலை அங்கேயே முடிவதில்லை. ஆர்டர், அதில் உள்ள பொருட்கள் மற்றும் டெலிவரி முன்னேற்றத்தை ஒரே இடத்தில் பாருங்கள்."
                  : "A message can start a sale, but the work does not end there. Keep the order, the products in it, and its shipment progress visible in one place."}
              </p>
              <ul>
                <li>{ta ? "உங்கள் கேட்லாக் பொருட்களுடன் இணைக்கப்பட்ட வாடிக்கையாளர் ஆர்டர்களைப் பாருங்கள்." : "See customer orders connected to your catalogue products."}</li>
                <li>{ta ? "சாட்களில் தேடாமல் பேமெண்ட் மற்றும் டெலிவரி நிலையை உடனடியாகப் பின்தொடருங்கள்." : "Follow payment and fulfilment status without hunting through chats."}</li>
                <li>{ta ? "எந்த ஆர்டர்கள் புதிது, பேக்கிங் ஆகிறது, அனுப்பப்பட்டது, சேர்ந்தது என்பதை அறியுங்கள்." : "Know which orders are new, being prepared, dispatched or delivered."}</li>
              </ul>
              <div style={{ marginTop: "20px" }}>
                <a className="btn btn-dark btn-small" href={MAILTO_ORDER}>
                  {ta ? "டெமோ பார்க்கவும் ↗" : "Show me a demo ↗"}
                </a>
              </div>
            </div>

            <div className="order-board" aria-label={ta ? "கேட்லாக் முதல் ஆர்டர் வரையிலான பயணம்" : "Illustrative catalogue-to-order journey"}>
              <div className="order-board-head">
                <span>{ta ? "விற்பனை ஒரு பயணம்" : "A sale has a journey"}</span>
                <span>{ta ? "மாதிரி முன்னோட்டம்" : "Illustrative preview"}</span>
              </div>
              <div className="order-path">
                <div className="order-node">
                  <i>▣</i>
                  <strong>{ta ? "பொருள் பார்வை" : "Product shown"}</strong>
                  <small>{ta ? "உங்கள் கேட்லாக்கில்" : "In your business catalogue"}</small>
                </div>
                <div className="order-node">
                  <i>♡</i>
                  <strong>{ta ? "வாடிக்கையாளர் தேர்வு" : "Customer chooses"}</strong>
                  <small>{ta ? "ஆர்வம் ஆர்டராக மாறுகிறது" : "Interest becomes an order"}</small>
                </div>
                <div className="order-node">
                  <i>₹</i>
                  <strong>{ta ? "ஆர்டர் மேலாண்மை" : "Order managed"}</strong>
                  <small>{ta ? "பணம் & தயாரிப்பு" : "Payment and preparation"}</small>
                </div>
                <div className="order-node">
                  <i>↗</i>
                  <strong>{ta ? "டெலிவரி கண்காணிப்பு" : "Delivery followed"}</strong>
                  <small>{ta ? "அனுப்பப்பட்டு சேர்ந்தது" : "Dispatched to delivered"}</small>
                </div>
              </div>
              <div className="sample-order">
                <div>
                  <strong>{ta ? "மாதிரி ஆர்டர் · உங்கள் கேட்லாக் பொருள்" : "Sample order · Product from your catalogue"}</strong>
                  <small>{ta ? "பொருள், வாடிக்கையாளர் மற்றும் அடுத்த கட்டம் எளிதாகத் தெரியும்" : "Item, customer and next step are easy to see"}</small>
                </div>
                <span>{ta ? "நடைபெறுகிறது" : "In progress"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. TEMPLATES (Exact Match HTML #templates) ── */}
      <section className="use-case-section" id="templates">
        <div className="landing-container template-feature">
          <div className="template-copy">
            <div className="eyebrow eyebrow-yellow">{ta ? "சந்தேகமின்றி டெம்ப்ளேட்டுகள்" : "Templates, without the uncertainty"}</div>
            <h2>{ta ? "செய்தியை உருவாக்குங்கள். நிலையைப் பாருங்கள். ஒப்புதல் கிடைத்ததும் அனுப்புங்கள்." : "Make a message. See its status. Send when it is approved."}</h2>
            <p>
              {ta
                ? "தபாலில் உங்கள் வாட்ஸ்அப் டெம்ப்ளேட்டை உருவாக்கி மாதிரி பாருங்கள்; மெட்டாவின் ஆய்வுக்கு சமர்ப்பித்து ஒப்புதல் நிலையை உடனே தெரிந்து கொள்ளுங்கள். பிரச்சாரத்தைத் தொடங்கும் முன்பே செய்தி தயாரா என்பதை உங்கள் குழு உறுதி செய்யலாம்."
                : "Build and preview your WhatsApp template in Thabaal, submit it for Meta review, and see whether it is in review or approved. Your team knows which message is ready before starting a campaign."}
            </p>
            <div className="template-steps">
              <span>{ta ? "1 · உருவாக்கி மாதிரி பார்க்கவும்" : "1 · Create and preview"}</span>
              <span>{ta ? "2 · மெட்டாவுக்கு சமர்ப்பிக்கவும்" : "2 · Submit to Meta"}</span>
              <span>{ta ? "3 · நிலையை சரிபார்க்கவும்" : "3 · Check status"}</span>
              <span>{ta ? "4 · ஒப்புதல் பெற்றதும் அனுப்பவும்" : "4 · Send if approved"}</span>
            </div>
            <p className="template-disclaimer">
              {ta ? "டெம்ப்ளேட் ஒப்புதலை மெட்டா மட்டுமே தீர்மானிக்கிறது; தபால் உத்தரவாதம் அளிக்காது." : "Template approval is decided by Meta, not guaranteed by Thabaal."}
            </p>
            <div className="template-cta-wrap">
              <a className="btn btn-dark btn-small" href={MAILTO_TEMPLATE}>
                {ta ? "டெம்ப்ளேட் செயல்முறை பார்க்க ↗" : "See template demo ↗"}
              </a>
            </div>
          </div>

          <div className="template-preview" aria-label={ta ? "மாதிரி செய்தி அட்டை" : "Illustrative message template card"}>
            <div className="template-preview-top">
              <strong>{ta ? "செய்தி டெம்ப்ளேட்டுகள்" : "Message templates"}</strong>
              <small>{ta ? "மாதிரி · ஒப்புதல் பெற்றது" : "Example · Approved"}</small>
            </div>
            <div className="template-message">
              <b>{ta ? "வணக்கம்! எங்கள் பண்டிகை சிறப்பு அறிவிப்பு ✨" : "Hi! Here is our festive update ✨"}</b>
              <p>
                {ta
                  ? "மெட்டாவால் மதிப்பாய்வு செய்யப்பட்ட வாட்ஸ்அப் டெம்ப்ளேட்டைப் பயன்படுத்தி வாடிக்கையாளர்களுக்கு சலுகை அல்லது அறிவிப்பைப் பகிருங்கள்."
                  : "Share an offer or announcement with customers using a reviewed WhatsApp template."}
              </p>
            </div>
            <div className="template-preview-bottom">
              <span>{ta ? "மார்க்கெட்டிங் டெம்ப்ளேட் · மாதிரி முன்னோட்டம்" : "Marketing template · Example preview"}</span>
              <b>{ta ? "பயன்படுத்த தயார் ✓" : "Ready to use ✓"}</b>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. PRICING (Official 22 OCT 2026 Matrix with Tabs for Plans, Features, Add-ons, Compare) ── */}
      <section className="pricing pricing-section" id="pricing">
        <div className="landing-container">
          <div className="section-head pricing-head">
            <div className="eyebrow">
              {ta ? "கட்டணத் திட்டங்கள் | 22 அக்டோபர் 2026" : "PRICING PLAN | 22 OCT 2026"}
            </div>
            <h2>
              {ta ? "எளிய திட்டங்கள். தெளிவான வணிக மதிப்பு." : "Simple plans. Clear business value."}
            </h2>
            <p className="pricing-note">
              {ta
                ? "வாட்ஸ்அப்பில் விற்கும் மற்றும் சேவை வழங்கும் தமிழ்நாடு வணிகங்களுக்காக உருவாக்கப்பட்டது. மூன்று திட்டங்களின் விலைகளிலும் GST சேர்க்கப்பட்டுள்ளது."
                : "Built for Tamil Nadu businesses selling and serving on WhatsApp. All three plan prices include GST."}
            </p>
          </div>

          {/* Unified Controls Bar: Navigation Tabs (Left) + Billing Term Toggle (Right) */}
          <div className="pricing-controls-row">
            {/* Left: 4 Content Navigation Tabs with Text-Tab / Underline Indicator */}
            <nav className="pricing-nav-tabs" role="tablist" aria-label={ta ? "கட்டணப் பிரிவுகள்" : "Pricing views"}>
              <button
                type="button"
                role="tab"
                aria-selected={pricingTab === "plans"}
                className={`pricing-nav-tab ${pricingTab === "plans" ? "active" : ""}`}
                onClick={() => setPricingTab("plans")}
              >
                <span>{ta ? "திட்டங்கள்" : "Plans"}</span>
                {pricingTab === "plans" && <span className="pricing-nav-indicator" />}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pricingTab === "features"}
                className={`pricing-nav-tab ${pricingTab === "features" ? "active" : ""}`}
                onClick={() => setPricingTab("features")}
              >
                <span>{ta ? "அனைத்து வசதிகள்" : "Features"}</span>
                {pricingTab === "features" && <span className="pricing-nav-indicator" />}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pricingTab === "addons"}
                className={`pricing-nav-tab ${pricingTab === "addons" ? "active" : ""}`}
                onClick={() => setPricingTab("addons")}
              >
                <span>{ta ? "கூடுதல் சேவைகள்" : "Add-ons"}</span>
                {pricingTab === "addons" && <span className="pricing-nav-indicator" />}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pricingTab === "compare"}
                className={`pricing-nav-tab ${pricingTab === "compare" ? "active" : ""}`}
                onClick={() => setPricingTab("compare")}
              >
                <span>{ta ? "ஒப்பீடு" : "Compare"}</span>
                {pricingTab === "compare" && <span className="pricing-nav-indicator" />}
              </button>
            </nav>

            {/* Right: Billing Frequency Switcher Toggle (Compact Segmented Pill) */}
            {pricingTab === "plans" && (
              <div className="billing-term-toggle" role="tablist" aria-label={ta ? "கட்டணக் காலம்" : "Billing cycle"}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billingCycle === "monthly"}
                  className={billingCycle === "monthly" ? "active" : ""}
                  onClick={() => setBillingCycle("monthly")}
                >
                  {ta ? "மாதாந்திரம்" : "Monthly"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billingCycle === "quarterly"}
                  className={billingCycle === "quarterly" ? "active" : ""}
                  onClick={() => setBillingCycle("quarterly")}
                >
                  {fillPrices(ta ? "காலாண்டு ({qsave}% சேமிப்பு)" : "Quarterly (Save {qsave}%)", prices)}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billingCycle === "yearly"}
                  className={billingCycle === "yearly" ? "active" : ""}
                  onClick={() => setBillingCycle("yearly")}
                >
                  {fillPrices(ta ? "வருடாந்திரம் ({ysave}% சேமிப்பு)" : "Yearly (Save {ysave}%)", prices)}
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: PLANS */}
          {pricingTab === "plans" && (
            <>
              {/* Green Pricing Assurance Callout Box */}
              <div className="pricing-assurance">
                <b>₹</b>
                <div>
                  <strong>
                    {ta
                      ? "வாட்ஸ்அப் செய்திக் கட்டணம் மெட்டாவின் அதிகாரப்பூர்வ விலையிலேயே கணக்கிடப்படுகிறது."
                      : "WhatsApp message charges are passed through at Meta’s official rates."}
                  </strong>
                  <p>
                    {ta
                      ? "அந்த செய்திக் கட்டணங்களில் தபால் கூடுதல் லாபம் சேர்ப்பதில்லை. மெட்டாவின் கட்டணங்கள் செய்தி வகை மற்றும் பெறும் நாட்டைப் பொறுத்தது; "
                      : "Thabaal does not add a markup to those message rates. Meta’s rates depend on the message category and recipient market; "}
                    <a href="https://business.whatsapp.com/products/platform-pricing" target="_blank" rel="noopener noreferrer">
                      {ta ? "மெட்டாவின் அதிகாரப்பூர்வ விலையைப் பார்க்கவும்" : "see Meta’s published pricing"}
                    </a>.
                  </p>
                </div>
              </div>

              {/* Official 3-Tier Pricing Grid */}
              <div className="pricing-tiers-grid">
                {PRICING_PLANS.map((plan) => {
                  const isPopular = plan.popular;
                  const priceInfo = priceInfoOf(prices[plan.id as keyof PriceTable], billingCycle);

                  return (
                    <article
                      key={plan.id}
                      className={`tier-card ${isPopular ? "tier-card-popular" : ""}`}
                    >
                      {isPopular && (
                        <span className="tier-popular-pill">
                          {ta ? plan.badge?.ta : plan.badge?.en}
                        </span>
                      )}

                      <div>
                        <div className="tier-head">
                          <h3>{ta ? plan.name.ta : plan.name.en}</h3>
                          <p className="tier-tagline">{ta ? plan.tagline.ta : plan.tagline.en}</p>
                        </div>

                        <div className="tier-price-box">
                          <span className="tier-currency">₹</span>
                          <span className="tier-amount">{priceInfo.monthlyRate}</span>
                          <span className="tier-per">/ {ta ? "மாதம்" : "mo"}</span>
                        </div>

                        <div className="tier-billed-note">
                          {ta ? priceInfo.billedNote.ta : priceInfo.billedNote.en}
                        </div>

                        <div className="tier-specs">
                          {(ta ? plan.specs.ta : plan.specs.en).map((spec, i) => (
                            <div key={i}>• {spec}</div>
                          ))}
                        </div>

                        <ul className="tier-features">
                          {(ta ? plan.features.ta : plan.features.en).map((feat, i) => (
                            <li key={i}>
                              <span className="tier-check" aria-hidden="true">✔</span>
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="tier-cta-box">
                        <a
                          className={`btn tier-btn ${isPopular ? "landing-btn-yellow" : "btn-dark"}`}
                          href="#start"
                        >
                          {ta ? plan.cta.ta : plan.cta.en}
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Trust Strip */}
              <div className="pricing-trust-strip">
                <span>
                  <i>✓</i> {ta ? "₹0 செய்திக் கூடுதல் கட்டணம் · அதிகாரப்பூர்வ மெட்டா விலை மட்டுமே" : "₹0 message markup · Direct official Meta rate"}
                </span>
                <span>
                  <i>✓</i> {ta ? "வரம்பற்ற வாடிக்கையாளர் தொடர்புகள் · தொடர்புகளுக்கு வரம்பில்லை" : "Unlimited customer reach · No contact list caps"}
                </span>
              </div>

              {/* How Billing Works Box */}
              <div className="how-billing-works-box">
                <h4>{ta ? "கட்டணம் எவ்வாறு செயல்படுகிறது?" : "How billing works"}</h4>
                <div className="how-billing-grid">
                  <div className="how-billing-item">
                    <strong>{ta ? "தபால் மென்பொருள் சந்தா" : "Thabaal software subscription"}</strong>
                    <p>
                      {ta
                        ? fillPrices("மாதாந்திர, காலாண்டு (-{qsave}%) அல்லது வருடாந்திர (-{ysave}%) கட்டணம். இயங்குதள வசதிகள், கேட்லாக், ஆர்டர்கள், அறிக்கைகள் மற்றும் உங்கள் திட்டத்திற்குரிய எண்கள் & பணியாளர் கணக்குகளை உள்ளடக்கியது. அனைத்து திட்டங்களிலும் GST சேர்க்கப்பட்டுள்ளது.", prices)
                        : fillPrices("Billed monthly, quarterly (-{qsave}%) or yearly (-{ysave}%). Covers platform access, catalogue, orders, reports, and your plan’s included numbers and logins. All plan prices include GST.", prices)}
                    </p>
                  </div>
                  <div className="how-billing-item">
                    <strong>{ta ? "மெட்டாவின் செய்திக் கட்டணம்" : "Meta WhatsApp message charges"}</strong>
                    <p>
                      {ta
                        ? "செய்திகளுக்கு மெட்டா நிர்ணயிக்கும் அதிகாரப்பூர்வ கட்டணத்தை மட்டுமே செலுத்துவீர்கள் (Utility ~₹0.11-₹0.14, Marketing ~₹0.78-₹0.88). தபால் ஒரு பைசா கூட கூடுதல் கட்டணம் வசூலிப்பதில்லை."
                        : "You pay Meta directly at their official rates (Utility ~₹0.11-₹0.14, Marketing ~₹0.78-₹0.88). Thabaal adds exactly ₹0 markup on any message."}
                    </p>
                  </div>
                  <div className="how-billing-item">
                    <strong>{ta ? "தொடர்பு வரம்புகள் இல்லை" : "No contact list caps or penalties"}</strong>
                    <p>
                      {ta
                        ? "அனைத்து திட்டங்களிலும் வரம்பற்ற வாடிக்கையாளர் தொடர்புகள், குறிச்சொற்கள் மற்றும் பகுப்புகள். உங்கள் வாடிக்கையாளர் பட்டியல் வளர்வதால் கூடுதல் கட்டணம் இல்லை."
                        : "Unlimited customer database contacts, tags, and segments across all plans. You never get penalized for growing your customer audience."}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: FULL FEATURES COMPARISON TABLE */}
          {pricingTab === "features" && (
            <div className="pricing-feature-table-card">
              <div className="pricing-table-container">
                <table className="pricing-table">
                  <thead>
                    <tr>
                      <th style={{ width: "38%" }}>{ta ? "அம்சம்" : "Feature"}</th>
                      <th style={{ width: "20%" }}>{fillPrices(ta ? "ஸ்டார்ட்டர் (₹{starter}/மா)" : "Starter (₹{starter}/mo)", prices)}</th>
                      <th className="col-featured" style={{ width: "22%" }}>
                        {fillPrices(ta ? "வளர்ச்சி (₹{growth}/மா) ★" : "Growth (₹{growth}/mo) ★", prices)}
                      </th>
                      <th style={{ width: "20%" }}>{fillPrices(ta ? "பிசினஸ் (₹{business}/மா)" : "Business (₹{business}/mo)", prices)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_COMPARISON.map((row, idx) => {
                      const renderVal = (val: string) => {
                        if (val === "Included") {
                          return <span className="included-badge">✔ {ta ? "சேர்க்கப்பட்டுள்ளது" : "Included"}</span>;
                        }
                        if (val === "—") {
                          return <span className="dash-badge">—</span>;
                        }
                        if (val === "Unlimited") {
                          return <strong>{ta ? "வரம்பற்றது" : "Unlimited"}</strong>;
                        }
                        return val;
                      };

                      return (
                        <tr key={idx}>
                          <td><strong>{ta ? row.name.ta : row.name.en}</strong></td>
                          <td>{renderVal(row.starter)}</td>
                          <td className="col-featured">{renderVal(row.growth)}</td>
                          <td>{renderVal(row.business)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="table-footnote-box">
                <div style={{ marginBottom: "10px" }}>
                  <strong>* {ta ? "பிரச்சாரங்கள் மற்றும் டெம்ப்ளேட்கள் நியாயமான பயன்பாடு:" : "Campaign and template fair usage:"}</strong>{" "}
                  {ta
                    ? "சிறு வணிக பயன்பாட்டிற்கு உகந்த அளவில் நிர்ணயிக்கப்பட்டுள்ளது. கூடுதல் தேவை இருப்பின் கோரிக்கையின் பேரில் வழங்கலாம்."
                    : "Campaigns and templates are sized for typical small-business usage. If you need higher limits, they are available on request."}
                </div>
                <div>
                  <strong>{ta ? "அறிக்கைகளைப் புரிந்து கொள்ளும் வழிகாட்டி:" : "How to read the reports:"}</strong>{" "}
                  <b>Overview</b> ({ta ? "சென்றடைந்தது, செயலிலுள்ள ஆர்டர்கள், இன்றைய விற்பனை" : "reach, active orders, today's sales"}),{" "}
                  <b>Customers</b> ({ta ? "மறுஆர்டர் வாடிக்கையாளர்கள், பகுதி வாரியாக, லாயல்டி நிலை" : "repeat buyers, area breakdown, loyalty tiers"}),{" "}
                  <b>Campaigns</b> ({ta ? "பிரச்சார வருவாய், ஆர்டர் மாற்றங்கள்" : "broadcast revenue, click-to-order conversions"}),{" "}
                  <b>Products</b> ({ta ? "அதிகம் விற்றவை, கைவிடப்பட்ட கார்ட்கள், மறுஆர்டர் சுழற்சி" : "best-sellers, cart drops, reorder cycle"}).
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ADD-ONS & CUSTOM WORK */}
          {pricingTab === "addons" && (
            <>
              {/* Add-ons Transparency Strip */}
              <div className="pricing-addons-strip" style={{ marginTop: "28px" }}>
                <div className="addon-item">
                  <strong>{ta ? "கூடுதல் பணியாளர் கணக்கு" : "Extra Staff Seat"}</strong>
                  <span>{ta ? "₹499 / மாதம் (விற்பனை மற்றும் ஆதரவுக் குழுக்களுக்கு)" : "INR 499 / seat / mo (Scale as team grows)"}</span>
                </div>
                <div className="addon-item">
                  <strong>{ta ? "கூடுதல் வாட்ஸ்அப் எண்" : "Extra WhatsApp Number"}</strong>
                  <span>{ta ? "₹599 / மாதம் (கிளைகள், துறைகள் & பிரச்சார எண்கள்)" : "INR 599 / number / mo (Branch & support lines)"}</span>
                </div>
                <div className="addon-item addon-highlight">
                  <strong>{ta ? "நேரடி அமைப்பு உதவி (Done-for-You)" : "Done-for-You Setup & Onboarding"}</strong>
                  <span>{ta ? "காலாண்டு & வருடாந்திர திட்டங்களில் இலவசம் (மாதாந்திரம் ₹299)" : "Free on Quarterly & Yearly (INR 299 one-time on Monthly)"}</span>
                </div>
                <div className="addon-item">
                  <strong>{ta ? "மெட்டாவின் செய்திக் கட்டணம்" : "Meta Message Charges"}</strong>
                  <span>{ta ? "₹0 கூடுதல் கட்டணம் (100% அதிகாரப்பூர்வ நேரடி விலை)" : "₹0 Thabaal markup (100% direct official rate)"}</span>
                </div>
              </div>

              {/* Custom Work Proposal Hero Card */}
              <div className="custom-work-hero-box">
                <h4>{ta ? "தனிப்பயன் வணிகத் தீர்வுகள் & Enterprise" : "Custom work proposal"}</h4>
                <p>
                  {ta
                    ? "பிரத்யேக கட்டமைப்பு, Tally / Zoho ERP இணைப்பு, அல்லது சிறப்பு அறிக்கைகள் தேவைப்படும் பெரிய வணிகங்களுக்கான தீர்வுகள்."
                    : "For businesses that need tailored setup, custom ERP/Tally integrations, higher multi-team throughput, or specialized reporting."}
                </p>

                <div className="custom-work-pillars-grid">
                  <div className="custom-pillar">
                    <strong>1. {ta ? "கூடுதல் திறன் (More capacity)" : "More capacity"}</strong>
                    <span>
                      {ta
                        ? "அதிக அளவிலான செய்திகள், 10+ வாட்ஸ்அப் எண்கள், பிரத்யேக சர்வர் வரிசைப்படுத்தல் மற்றும் அதிவேக அனுப்புதல்."
                        : "High-volume broadcasts, 10+ WhatsApp numbers, dedicated message throughput, and high-speed queuing."}
                    </span>
                  </div>
                  <div className="custom-pillar">
                    <strong>2. {ta ? "வணிகத்திற்கேற்ற கட்டமைப்பு (Business-specific setup)" : "Business-specific setup"}</strong>
                    <span>
                      {ta
                        ? "தனிப்பயன் ஆர்டர் நிலைகள், கிளை வழியமைப்புகள், பிராந்திய மொழி ஆதரவு மற்றும் தனிப்பயன் தகவல் சேகரிப்பு."
                        : "Tailored order workflows, branch routing, custom product variants, and multi-language support."}
                    </span>
                  </div>
                  <div className="custom-pillar">
                    <strong>3. {ta ? "இணைக்கப்பட்ட மென்பொருட்கள் (Connected systems)" : "Connected systems"}</strong>
                    <span>
                      {ta
                        ? "Tally, Zoho, SAP அல்லது சொந்த பில்லிங் சாப்ட்வேருடன் நேரடி இருவழி இணைப்பு மற்றும் இன்வென்டரி ஒத்திசைவு."
                        : "Two-way integration with Tally, Zoho, SAP, custom POS, or proprietary inventory databases."}
                    </span>
                  </div>
                  <div className="custom-pillar">
                    <strong>4. {ta ? "தனிப்பயன் அறிக்கைகள் (Tailored reporting)" : "Tailored reporting"}</strong>
                    <span>
                      {ta
                        ? "பிரத்யேக விற்பனை அளவீடுகள், தானியங்கி PDF/Excel அறிக்கைகள், தலைமை நிர்வாக டாஷ்போர்டு மற்றும் நேரடித் தரவு ஏற்றுமதி."
                        : "Custom sales attribution metrics, scheduled automated PDF/Excel digests, and executive dashboards."}
                    </span>
                  </div>
                </div>

                <div className="custom-work-footer">
                  <div>
                    <span>{ta ? "எங்கள் தொழில்நுட்பக் குழுவுடன் நேரடியாகப் பேசுங்கள்:" : "Speak directly with our technical team:"} </span>
                    <a href="tel:+916379140626">+91 63791 40626</a>
                    <span style={{ margin: "0 8px", opacity: 0.5 }}>|</span>
                    <a href="mailto:thabaal26@gmail.com">thabaal26@gmail.com</a>
                  </div>
                  <a className="btn landing-btn-yellow btn-small" href="tel:+916379140626">
                    {ta ? "அழைக்கவும் ↗" : "Talk to our team ↗"}
                  </a>
                </div>
              </div>
            </>
          )}

          {/* TAB 4: COMPETITOR COMPARISON & THE THABAAL STORY */}
          {pricingTab === "compare" && (
            <>
              <div className="pricing-feature-table-card">
                <div className="pricing-table-container">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th style={{ width: "30%" }}>{ta ? "தளம்" : "Platform"}</th>
                        <th style={{ width: "70%" }}>{ta ? "விலை" : "Price"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMPETITOR_COMPARISON.map((row, idx) => (
                        <tr
                          key={idx}
                          style={row.isThabaal ? { background: "rgba(253, 185, 19, 0.08)", fontWeight: 700 } : undefined}
                        >
                          <td>
                            <strong>
                              {row.platform} {row.isThabaal && <span style={{ color: "#d97706" }}>★</span>}
                            </strong>
                          </td>
                          <td style={row.isThabaal ? { color: "var(--navy)", fontWeight: 800 } : undefined}>
                            {fillPrices(ta ? row.price.ta : row.price.en, prices)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="table-footnote-box">
                  {ta
                    ? "விலை மற்றும் அம்சங்கள் 2026 பொதுத் தகவல்களின் அடிப்படையில் தொகுக்கப்பட்டவை. பிற தளங்களின் விலை மாற்றங்களுக்கு உட்பட்டது."
                    : "Prices and features benchmarked from publicly available platform data as of 2026. Competitor terms and regional rates may change."}
                </div>
              </div>

              {/* The Thabaal story for a Tamil Nadu business owner */}
              <div className="how-billing-works-box" style={{ marginTop: "28px" }}>
                <h4>
                  {ta
                    ? "தமிழ்நாடு வணிக உரிமையாளருக்கான தபால் கதை"
                    : "The Thabaal story for a Tamil Nadu business owner"}
                </h4>
                <div className="how-billing-grid">
                  <div className="how-billing-item">
                    <strong>1. {ta ? "வெளிப்படையான விலை" : "Honest, all-inclusive pricing"}</strong>
                    <p>
                      {ta
                        ? "அனைத்து விலைகளும் ரூபாயில் GST உட்பட தெளிவாகக் காட்டப்படும். மறைமுகக் கட்டணங்கள் இல்லை; மெட்டாவின் செய்திக் கட்டணத்தில் ₹0 கூடுதல் லாபம்."
                        : "All three plans are quoted in INR with GST included. No surprise conversion rates, and ₹0 markup on official Meta charges."}
                    </p>
                  </div>
                  <div className="how-billing-item">
                    <strong>2. {ta ? "வணிக இயக்கம் மையத்தில்" : "Commerce at the center"}</strong>
                    <p>
                      {ta
                        ? "வெறும் தகவலனுப்புதல் மட்டுமின்றி கேட்லாக், ஆர்டர் போர்டு, UPI பேமெண்ட் மற்றும் பேக்கிங் பட்டியல் அனைத்தும் ஒரே தளத்தில் இணைக்கப்பட்டுள்ளது."
                        : "Not just broadcast messaging. Catalogue sync, live order pipeline, UPI payment collection, and packing lists in one unified workflow."}
                    </p>
                  </div>
                  <div className="how-billing-item">
                    <strong>3. {ta ? "பல எண்கள் & உள்ளூர் ஆதரவு" : "Multi-number & local support"}</strong>
                    <p>
                      {ta
                        ? "2, 3 அல்லது 5 எண்கள் திட்டத்திலேயே வழங்கப்படுகிறது. தமிழ் & ஆங்கில இருமொழி இடைமுகம், நேரடி தொலைபேசி மற்றும் வாட்ஸ்அப் ஆதரவு."
                        : "2, 3, or 5 WhatsApp numbers included per tier so branches and teams operate cleanly. Full bilingual Tamil & English with direct support."}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── 7. FAQ — dark premium card, two columns (#faq) ── */}
      <section className="faq-section" id="faq" aria-labelledby="faq-heading">
        <div className="landing-container">
          <div className="faq-card">
            <div className="faq-shell">
              <div className="faq-aside">
                <header className="faq-head">
                  <span className="faq-badge">FAQ</span>
                  <h2 id="faq-heading">
                    {ta ? (
                      <>
                        அடிக்கடி கேட்கப்படும் <em>கேள்விகள்</em>
                      </>
                    ) : (
                      <>
                        Frequently Asked <em>Questions</em>
                      </>
                    )}
                  </h2>
                  <p>
                    {ta
                      ? "தபால் பற்றிய பொதுவான கேள்விகளுக்கு விரைவான பதில்கள்."
                      : "Quick answers to common questions about Thabaal."}
                  </p>
                </header>

                <div className="faq-flight" aria-hidden="true">
                  <svg className="faq-flight-trail" viewBox="0 0 300 90" focusable="false">
                    <path d="M 8 80 C 52 30, 104 92, 160 54 S 236 14, 266 24" />
                    <circle cx="8" cy="80" r="3.4" />
                  </svg>
                  <Image
                    className="faq-flight-bird"
                    src="/brands/thabaal/mark.png"
                    alt=""
                    width={44}
                    height={24}
                    unoptimized
                  />
                </div>

                <a className="faq-wa" href={DEMO_URL} {...DEMO_TARGET}>
                  <span className="faq-wa-icon">
                    <WhatsAppGlyph size={18} />
                  </span>
                  <span>{ta ? "வாட்ஸ்அப்பில் பேசுங்கள்" : "Chat on WhatsApp"}</span>
                  <span className="faq-wa-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </div>

              <div className="faq-list">
                {FAQ_ITEMS.slice(0, FAQ_PRIMARY_COUNT).map((item, idx) => renderFaq(item, idx))}

                <button
                  type="button"
                  className={`faq-more-btn ${showMoreFaq ? "open" : ""}`}
                  onClick={() => setShowMoreFaq((v) => !v)}
                  aria-expanded={showMoreFaq}
                  aria-controls="faq-more-panel"
                >
                  <span>
                    {showMoreFaq
                      ? ta
                        ? "குறைவான கேள்விகளைக் காட்டு"
                        : "Show fewer questions"
                      : ta
                        ? `மேலும் ${FAQ_ITEMS.length - FAQ_PRIMARY_COUNT} கேள்விகளைக் காட்டு`
                        : `Show ${FAQ_ITEMS.length - FAQ_PRIMARY_COUNT} more questions`}
                  </span>
                  <span className="faq-more-chevron" aria-hidden="true" />
                </button>

                <div id="faq-more-panel" className={`faq-more ${showMoreFaq ? "open" : ""}`}>
                  <div className="faq-more-inner">
                    {FAQ_ITEMS.slice(FAQ_PRIMARY_COUNT).map((item, i) => renderFaq(item, i + FAQ_PRIMARY_COUNT))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA BANNER (Exact Match HTML #start) ── */}
      <section className="final-cta" id="start">
        <div className="landing-container final-cta-inner">
          <div>
            <h2>{ta ? "உங்கள் வணிகத்திற்கு தபால் எதை தெளிவாக்கும் என்பதைப் பாருங்கள்." : "See what Thabaal could make clearer for your business."}</h2>
            <p>
              {ta
                ? "மாதிரி டாஷ்போர்டைப் பாருங்கள், அல்லது தனிப்பட்ட விளக்கத்திற்கு எங்களைத் தொடர்பு கொள்ளுங்கள்."
                : "Take a look at the sample dashboard, or speak with us for a personal walkthrough."}
            </p>
          </div>
          <div className="final-cta-actions">
            <a className="btn btn-dark" href={MAILTO_DEMO}>
              {ta ? "டெமோ பதிவு செய்க" : "Book a demo"} <span>↗</span>
            </a>
            <a className="btn btn-secondary" href={TEL_PHONE}>
              {ta ? "அழைக்க 63791 40626" : "Call 63791 40626"}
            </a>
          </div>
        </div>
      </section>

      {/* ── 9. FULL BRAND FOOTER — TAMIL NADU HERITAGE TRAIL & INTERACTIVE LANDSCAPE ── */}
      <HeritageFooter lang={lang} />
    </div>
  );
}
