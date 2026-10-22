"use client";

import { useState } from "react";
import Image from "next/image";
import { ScrollReveal, StaggerGroup, StaggerItem, SectionReveal } from "@/components/motion";
import "./landing.css";
import { DEMO_TARGET, DEMO_URL } from "./demo-link";

type Lang = "en" | "ta";
type T = { en: string; ta: string };

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

/* ── 2. Frequently Asked Questions (Exact Match HTML #faq) ── */
const FAQ_ITEMS: { q: T; a: T }[] = [
  {
    q: {
      en: "How do analytics help my business?",
      ta: "அறிக்கைகள் எனது வணிகத்திற்கு எவ்வாறு உதவுகின்றன?",
    },
    a: {
      en: "They put message reach, customer response, orders, recorded sales and message spend in one understandable view. Use that picture to improve your next offer and decide where to spend—not as a guarantee that every sale came from a message.",
      ta: "செய்தி சென்றடைந்தது, வாடிக்கையாளர் பதில்கள், ஆர்டர்கள், விற்பனை மற்றும் செய்திச் செலவு ஆகியவற்றை ஒரே எளிய பார்வையில் வைக்கின்றன. அடுத்த சலுகையை மேம்படுத்தவும், எங்கு செலவிட வேண்டும் என்பதைத் தீர்மானிக்கவும் இந்த விவரங்களைப் பயன்படுத்துங்கள்.",
    },
  },
  {
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
    q: {
      en: "Do you add to Meta’s WhatsApp message rate?",
      ta: "மெட்டாவின் வாட்ஸ்அப் செய்திக் கட்டணத்தில் கூடுதல் கட்டணம் சேர்க்கிறீர்களா?",
    },
    a: {
      en: "No—not one paisa. Meta’s official message charges pass through without a Thabaal markup; your Thabaal plan fee is separate.",
      ta: "இல்லை—ஒரு பைசா கூட இல்லை. மெட்டாவின் அதிகாரப்பூர்வ செய்திக் கட்டணங்கள் தபாலின் கூடுதல் லாபம் எதுவுமின்றி நேரடியாக கணக்கிடப்படுகின்றன; தபால் மென்பொருள் திட்டக் கட்டணம் மட்டுமே தனியானது.",
    },
  },
];

export function LandingSections({ lang }: { lang: Lang }) {
  const ta = lang === "ta";
  const [activeDemo, setActiveDemo] = useState<"overview" | "campaign" | "payments">("overview");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const demo = DEMO_DATA[activeDemo];

  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  };

  return (
    <div className="tl-root" id="explore">
      {/* ── 1. PROOF STRIP (Exact Match HTML) ── */}
      <div className="proof-strip">
        <ScrollReveal direction="up" distance={14} duration={400} className="landing-container proof-row">
          <div>
            <strong>
              {ta ? "தமிழ்நாடு வணிகங்களுக்காக உருவாக்கப்பட்டது." : "Made for the way business happens in Tamil Nadu."}
            </strong>{" "}
            {ta
              ? "மார்க்கெட்டிங் படிப்பு தேவையின்றி வாடிக்கையாளர்களைச் சென்றடைந்து, ஆர்டர்களைப் பின்தொடர்ந்து, முடிவுகளைப் புரிந்து கொள்ளுங்கள்."
              : "Reach customers, follow orders and understand results without a marketing degree."}
          </div>
          <div className="proof-tags">
            <span className="proof-tag">{ta ? "சில்லறை வணிகம்" : "Retail"}</span>
            <span className="proof-tag">{ta ? "உணவு" : "Food"}</span>
            <span className="proof-tag">{ta ? "சேவைகள்" : "Services"}</span>
            <span className="proof-tag">{ta ? "D2C" : "D2C"}</span>
          </div>
        </ScrollReveal>
      </div>

      {/* ── 2. THREE REASONS TO CHOOSE THABAAL (Exact Match HTML #features) ── */}
      <SectionReveal className="workspace-section" id="features">
        <div className="landing-container">
          <ScrollReveal direction="up" className="section-head">
            <div className="eyebrow">{ta ? "தபாலைத் தேர்வு செய்ய 3 காரணங்கள்" : "Three reasons to choose Thabaal"}</div>
            <h2>{ta ? "வாட்ஸ்அப் மார்க்கெட்டிங் வெறும் “சென்ட்” பொத்தானோடு முடிந்துவிடக்கூடாது." : "WhatsApp marketing should do more than press “send.”"}</h2>
            <p>
              {ta
                ? "செய்திச் செலவுகளைத் துல்லியமாக அறிந்து, வாடிக்கையாளர்கள் என்ன செய்தார்கள் என்பதைப் புரிந்து, யோசனையிலிருந்து மெட்டா ஒப்புதல் வரை தெளிவுடன் செயல்படுங்கள்."
                : "Know what your messages cost, understand what customers did next, and move from a message idea to Meta review with less guesswork."}
            </p>
          </ScrollReveal>

          <StaggerGroup as="div" className="usp-grid">
            {/* Card 1: Honest Message Costs */}
            <StaggerItem as="article" className="usp-card cost">
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
            </StaggerItem>

            {/* Card 2: Marketing Analytics */}
            <StaggerItem as="article" className="usp-card insight">
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
            </StaggerItem>

            {/* Card 3: Template Confidence */}
            <StaggerItem as="article" className="usp-card templates">
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
            </StaggerItem>
          </StaggerGroup>
        </div>
      </SectionReveal>

      {/* ── 3. ANALYTICS & REPORTS (Exact Match HTML #reports) ── */}
      <SectionReveal className="demo-section" id="reports">
        <div className="landing-container">
          <ScrollReveal direction="up" className="section-head">
            <div className="eyebrow eyebrow-yellow">{ta ? "வணிக உரிமையாளர்களுக்கான அறிக்கைகள்" : "Analytics made for business owners"}</div>
            <h2>{ta ? "உங்கள் மார்க்கெட்டிங் உண்மையான வணிகத்தைக் கொண்டு வந்ததா?" : "Did your marketing bring real business?"}</h2>
            <p>
              {ta
                ? "குழப்பமான வரைபடங்களுக்குப் பதிலாக, செய்திகள் சென்றடைந்தது முதல் வாடிக்கையாளர் பதில், ஆர்டர்கள், வந்த விற்பனை வரை வணிகப் பயணத்தை தபால் எளிதாக்குகிறது. அடுத்த பிரச்சாரத்தை புத்திசாலித்தனமாகத் திட்டமிட செலவையும் செயலையும் ஒப்பிட்டுப் பாருங்கள்."
                : "Instead of a wall of charts, Thabaal helps you follow the business cycle: messages reached customers, customers showed interest, orders came in, and sales were recorded. Compare that activity with what you spent to plan the next campaign more wisely."}
            </p>
          </ScrollReveal>

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
      </SectionReveal>

      {/* ── 4. ORDERS & CATALOGUE (Exact Match HTML #how-it-works) ── */}
      <SectionReveal className="steps-section" id="how-it-works">
        <div className="landing-container">
          <ScrollReveal direction="up" className="section-head">
            <div className="eyebrow">{ta ? "வெறும் அறிவிப்புகளுக்கு அப்பால்" : "Beyond broadcasting"}</div>
            <h2>{ta ? "உங்கள் பொருட்கள் ஆர்டர்களாக மாறலாம். உங்கள் ஆர்டர்கள் எங்கும் மறையக்கூடாது." : "Your products can lead to orders. Your orders should never disappear."}</h2>
            <p>
              {ta
                ? "உங்கள் வணிகக் கேட்லாக்கில் உள்ள பொருட்களையும், வாடிக்கையாளர்கள் வைக்கும் ஆர்டர்களையும் தபால் ஒன்றாக இணைக்கிறது; பேமெண்ட், பேக்கிங் மற்றும் டெலிவரியை ஒரே இடத்தில் கண்காணிக்கலாம்."
                : "Thabaal brings together the products you publish in your business catalogue and the orders customers place, so your team can follow each order through payment, packing and delivery."}
            </p>
          </ScrollReveal>

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
      </SectionReveal>

      {/* ── 5. TEMPLATES (Exact Match HTML #templates) ── */}
      <SectionReveal className="use-case-section" id="templates">
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
            <p style={{ fontSize: "12px", marginTop: "19px", color: "var(--muted)" }}>
              {ta ? "டெம்ப்ளேட் ஒப்புதலை மெட்டா மட்டுமே தீர்மானிக்கிறது; தபால் உத்தரவாதம் அளிக்காது." : "Template approval is decided by Meta, not guaranteed by Thabaal."}
            </p>
            <a className="btn btn-dark btn-small" href={MAILTO_TEMPLATE}>
              {ta ? "டெம்ப்ளேட் செயல்முறை பார்க்க ↗" : "See template demo ↗"}
            </a>
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
      </SectionReveal>

      {/* ── 6. PRICING (Exact Match HTML #pricing with Pricing Assurance Box) ── */}
      <SectionReveal className="pricing" id="pricing">
        <div className="landing-container">
          <ScrollReveal direction="up" className="section-head">
            <div className="eyebrow">{ta ? "கட்டணம்" : "Pricing"}</div>
            <h2>{ta ? "உங்கள் மென்பொருள் கட்டணம் தனி. மெட்டாவின் செய்திக் கட்டணம் அதிகாரப்பூர்வ விலையிலேயே இருக்கும்." : "Your software plan is separate. Meta’s message rate stays Meta’s rate."}</h2>
            <p className="pricing-note">
              {ta
                ? "நான்கு தபால் திட்டங்கள் இறுதியாக்கப்பட்டு வருகின்றன. ஒவ்வொரு திட்டக் கட்டணமும் தெளிவாகக் காட்டப்படும்; மெட்டாவின் வாட்ஸ்அப் செய்திக் கட்டணத்தில் தபால் கூடுதல் கட்டணம் வசூலிக்காது."
                : "Four Thabaal plans are being finalised. Each plan fee will be shown clearly; there is no Thabaal markup on Meta’s WhatsApp message charges."}
            </p>
          </ScrollReveal>

          {/* Green Pricing Assurance Callout Box */}
          <div className="pricing-assurance">
            <b>₹</b>
            <div>
              <strong>
                {ta ? "வாட்ஸ்அப் செய்திக் கட்டணம் மெட்டாவின் அதிகாரப்பூர்வ விலையிலேயே கணக்கிடப்படுகிறது." : "WhatsApp message charges are passed through at Meta’s official rates."}
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

          {/* 4 Pricing Plan Cards */}
          <div className="pricing-grid">
            <article className="price-card">
              <div className="plan">{ta ? "திட்டம் 01" : "Plan 01"}</div>
              <p className="plan-note">{ta ? "விவரங்கள் விரைவில்" : "Details coming soon"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில் அறிவிக்கப்படும்" : "Pricing to be announced"}</div>
            </article>

            <article className="price-card featured">
              <div className="plan">{ta ? "திட்டம் 02" : "Plan 02"}</div>
              <p className="plan-note">{ta ? "விவரங்கள் விரைவில்" : "Details coming soon"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில் அறிவிக்கப்படும்" : "Pricing to be announced"}</div>
            </article>

            <article className="price-card">
              <div className="plan">{ta ? "திட்டம் 03" : "Plan 03"}</div>
              <p className="plan-note">{ta ? "விவரங்கள் விரைவில்" : "Details coming soon"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில் அறிவிக்கப்படும்" : "Pricing to be announced"}</div>
            </article>

            <article className="price-card">
              <div className="plan">{ta ? "திட்டம் 04" : "Plan 04"}</div>
              <p className="plan-note">{ta ? "விவரங்கள் விரைவில்" : "Details coming soon"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில் அறிவிக்கப்படும்" : "Pricing to be announced"}</div>
            </article>
          </div>
        </div>
      </SectionReveal>

      {/* ── 7. QUESTIONS OWNERS ASK (Exact Match HTML #faq) ── */}
      <SectionReveal className="faq-section" id="faq">
        <div className="landing-container faq-grid">
          {/* Left Column */}
          <div>
            <div className="eyebrow">{ta ? "உரிமையாளர்கள் கேட்கும் கேள்விகள்" : "Questions owners ask"}</div>
            <h2>{ta ? "தெளிவாகப் புரிந்துகொள்வோம்." : "Let’s make this clear."}</h2>
            <p>
              {ta
                ? "கடினமான வார்த்தைகள் இல்லை, யூகங்கள் இல்லை. டெமோ பாருங்கள் அல்லது நேரடியாக எங்களிடம் கேளுங்கள்."
                : "No jargon, no guessing. See the demo or ask us directly."}
            </p>
            <a className="btn btn-dark" href={TEL_PHONE}>
              {ta ? "தபாலுடன் பேச" : "Call Thabaal"} <span>↗</span>
            </a>
          </div>

          {/* Right Column: Accordion */}
          <div className="faq-list">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`faq-item ${isOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="faq-question"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <span className="faq-q-text">{item.q[lang]}</span>
                    <span className="faq-toggle-icon" aria-hidden="true">+</span>
                  </button>
                  <div className="faq-answer">
                    <p>{item.a[lang]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionReveal>

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

      {/* ── 9. FULL BRAND FOOTER (Exact Match HTML #login with Official Logo Plate) ── */}
      <footer id="login">
        <div className="landing-container">
          <div className="footer-top">
            <div className="footer-brand">
              <span className="footer-logo-plate">
                <Image
                  src={ta ? "/brands/thabaal/thabaal-logo-ta.png" : "/brands/thabaal/thabaal-logo-en.png"}
                  alt="Thabaal"
                  width={154}
                  height={52}
                  className="footer-logo"
                  style={{ width: "170px", height: "auto" }}
                />
              </span>
              <p>
                {ta
                  ? "வாட்ஸ்அப் மார்க்கெட்டிங், தெளிவான அறிக்கைகள், கேட்லாக் ஆர்டர்கள் மற்றும் டெம்ப்ளேட் கண்காணிப்பு — அனைத்தும் ஒரே எளிய தளத்தில்."
                  : "WhatsApp marketing, clearer analytics, catalogue orders and template visibility in one simple place."}
              </p>
              <p>
                <a href={TEL_PHONE}>63791 40626</a>
                <br />
                <a href="mailto:thabaal26@gmail.com">thabaal26@gmail.com</a>
              </p>
            </div>

            <nav className="footer-links" aria-label={ta ? "அடிக்குறிப்பு இணைப்புகள்" : "Footer links"}>
              <a href="#features">{ta ? "தபால் ஏன்" : "Why Thabaal"}</a>
              <a href="#reports">{ta ? "அறிக்கைகள்" : "Analytics"}</a>
              <a href="#how-it-works">{ta ? "ஆர்டர்கள்" : "Orders"}</a>
              <a href="#templates">{ta ? "டெம்ப்ளேட்டுகள்" : "Templates"}</a>
              <a href="#pricing">{ta ? "கட்டணம்" : "Pricing"}</a>
              <a href={MAILTO_DEMO}>{ta ? "டெமோ பதிவு செய்க" : "Book a demo"}</a>
            </nav>
          </div>

          <div className="footer-bottom">
            <span>© 2026 Thabaal. {ta ? "வளரும் வணிகங்களுக்காக உருவாக்கப்பட்டது." : "Built for growing businesses."}</span>
            <span>{ta ? "வாட்ஸ்அப் மார்க்கெட்டிங் இனி எளிது." : "WhatsApp marketing made simple."}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
