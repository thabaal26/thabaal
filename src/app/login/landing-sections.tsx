"use client";

import { useState } from "react";
import Image from "next/image";
import "./landing.css";

type Lang = "en" | "ta";
type T = { en: string; ta: string };

const WA = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
const MAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "";
const TALK = WA
  ? `https://wa.me/${WA}?text=${encodeURIComponent("Hi Thabaal, I'd like a demo for my business.")}`
  : MAIL
    ? `mailto:${MAIL}?subject=${encodeURIComponent("Thabaal demo")}`
    : "#top";

interface DemoDataset {
  title: T;
  copy: T;
  period: T;
  metrics: { label: T; value: string; tone?: "default" | "mint" | "cream" | "lavender" }[];
  action: T;
}

const DEMO_DATA: Record<"overview" | "campaign" | "payments", DemoDataset> = {
  overview: {
    title: { en: "This week at a glance", ta: "இந்த வாரம் ஒரு பார்வையில்" },
    copy: { en: "Your messages are reaching customers and bringing paid orders.", ta: "உங்கள் செய்திகள் வாடிக்கையாளர்களைச் சென்றடைந்து, பணம் பெற்ற ஆர்டர்களைக் கொண்டு வருகின்றன." },
    period: { en: "This month", ta: "இந்த மாதம்" },
    metrics: [
      { label: { en: "WhatsApp cost", ta: "WhatsApp செலவு" }, value: "Rs. 500", tone: "default" },
      { label: { en: "Paid sales", ta: "வந்த விற்பனை" }, value: "Rs. 12,400", tone: "mint" },
      { label: { en: "Money waiting", ta: "வர வேண்டிய பணம்" }, value: "Rs. 3,200", tone: "cream" },
      { label: { en: "Return per Re. 1", ta: "ரூ. 1-க்கு லாபம்" }, value: "Rs. 24.80", tone: "lavender" },
    ],
    action: {
      en: "Next action: send reminders to 9 unpaid orders.",
      ta: "அடுத்த செயல்: 9 நிலுவை ஆர்டர்களுக்கு நினைவூட்டல் அனுப்பவும்.",
    },
  },
  campaign: {
    title: { en: "Diwali offer campaign", ta: "தீபாவளி சலுகை பிரச்சாரம்" },
    copy: { en: "This is how a campaign becomes a simple business story.", ta: "ஒரு பிரச்சாரம் எவ்வாறு தெளிவான வணிக வெற்றியாக மாறுகிறது என்பதற்கான சான்று." },
    period: { en: "This month", ta: "இந்த மாதம்" },
    metrics: [
      { label: { en: "Reached", ta: "சென்றடைந்தது" }, value: "820", tone: "default" },
      { label: { en: "Read", ta: "படித்தவர்கள்" }, value: "610", tone: "mint" },
      { label: { en: "Paid orders", ta: "ஆர்டர்கள்" }, value: "28", tone: "cream" },
      { label: { en: "Sales", ta: "விற்பனை" }, value: "Rs. 18,600", tone: "lavender" },
    ],
    action: {
      en: "Best result: customers who bought sweets in the last 90 days.",
      ta: "சிறந்த முடிவு: கடந்த 90 நாட்களில் இனிப்பு வாங்கிய வாடிக்கையாளர்கள்.",
    },
  },
  payments: {
    title: { en: "Money to collect", ta: "வசூலிக்க வேண்டிய பணம்" },
    copy: { en: "Keep payment status separate from the order status.", ta: "ஆர்டர் நிலையிலிருந்து பேமெண்ட் நிலையைத் தனியாகத் தெளிவாகப் பாருங்கள்." },
    period: { en: "This month", ta: "இந்த மாதம்" },
    metrics: [
      { label: { en: "Payment links", ta: "பேமெண்ட் லிங்க்கள்" }, value: "14", tone: "default" },
      { label: { en: "Paid today", ta: "இன்று வந்தது" }, value: "Rs. 6,450", tone: "mint" },
      { label: { en: "COD pending", ta: "ரொக்கம் (COD)" }, value: "Rs. 1,180", tone: "cream" },
      { label: { en: "Failed / expired", ta: "தோல்வி / காலாவதி" }, value: "4", tone: "lavender" },
    ],
    action: {
      en: "Next action: send a payment reminder or record cash received.",
      ta: "அடுத்த செயல்: பேமெண்ட் நினைவூட்டல் அனுப்பவும் அல்லது பணத்தைப் பதிவு செய்யவும்.",
    },
  },
};

const FAQ_ITEMS: { q: T; a: T }[] = [
  {
    q: { en: "Do I need a marketing team?", ta: "எனக்கு ஒரு மார்க்கெட்டிங் குழு தேவையா?" },
    a: {
      en: "No. Thabaal is designed for the owner or one small team member to use from a phone.",
      ta: "இல்லை. வணிக உரிமையாளர் அல்லது ஒரே ஒரு ஊழியர் தனது மொபைல் போனிலிருந்தே சுலபமாக இயக்கும் வகையில் தபால் வடிவமைக்கப்பட்டுள்ளது.",
    },
  },
  {
    q: { en: "Will I know if customers read the message?", ta: "வாடிக்கையாளர்கள் செய்தியைப் படித்தார்களா என்று தெரியுமா?" },
    a: {
      en: "Yes. You can see sent, delivered, read, replied, ordered and paid stages.",
      ta: "ஆம். அனுப்பியது, சென்றடைந்தது, படித்தது, பதிலளித்தது, கார்ட் ஆர்டர் செய்தது மற்றும் பணம் செலுத்தியது என ஒவ்வொரு கட்டத்தையும் நேரடியாகக் காணலாம்.",
    },
  },
  {
    q: { en: "Can I collect payments through Thabaal?", ta: "தபால் மூலம் பணம் வசூலிக்க முடியுமா?" },
    a: {
      en: "The Payments section is designed to track payment links, UPI, cash, bank payments and COD collection.",
      ta: "ஆம். வாட்ஸ்அப் பேமெண்ட் லிங்க்கள், UPI, நேரடி ரொக்கம், வங்கிப் பரிவர்த்தனை மற்றும் டெலிவரியில் ரொக்கம் (COD) ஆகியவற்றை ஒரே இடத்தில் வசூலித்துக் கண்காணிக்கலாம்.",
    },
  },
  {
    q: { en: "Will I know how much the campaign cost?", ta: "பிரச்சாரத்திற்கு எவ்வளவு செலவானது என்று தெரியுமா?" },
    a: {
      en: "Yes. WhatsApp message costs should sit beside sales and paid orders, so the return is easy to understand.",
      ta: "ஆம். வாட்ஸ்அப் செய்திக் கட்டணங்கள், கிடைத்த விற்பனை மற்றும் வந்த ஆர்டர்களின் அருகிலேயே காட்டப்படுவதால், உங்கள் லாப விகிதத்தை மிக எளிதாகப் புரிந்து கொள்ளலாம்.",
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
      {/* ── 1. PROOF STRIP ── */}
      <section className="proof-strip">
        <div className="landing-container proof-row">
          <span className="proof-text">
            {ta
              ? "தமிழ்நாடு வணிகங்களுக்காக உருவாக்கப்பட்டது. மார்க்கெட்டிங் படிப்பு தேவையில்லை."
              : "Made for the way business happens in Tamil Nadu. No marketing degree needed."}
          </span>
          <div className="proof-tags" role="list">
            <span className="proof-tag" role="listitem">Retail</span>
            <span className="proof-tag" role="listitem">Food</span>
            <span className="proof-tag" role="listitem">Services</span>
            <span className="proof-tag" role="listitem">D2C</span>
          </div>
        </div>
      </section>

      {/* ── 2. ONE SIMPLE WORKSPACE (4 Cards) ── */}
      <section className="workspace-section" id="features">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow">{ta ? "எளிய ஒரே பணியிடம்" : "One simple workspace"}</div>
            <h2>{ta ? "உங்கள் செய்தி விற்பனையாக மாறத் தேவையான அனைத்தும்." : "Everything your message needs to become a sale."}</h2>
            <p>
              {ta
                ? "அனுப்புதல், படித்தல், பதிலளித்தல், ஆர்டர் மற்றும் பணம் வசூலித்தல் என தனித்தனியாக இருக்கும் படிகளை தபால் ஒன்றாக இணைக்கிறது."
                : "Thabaal connects the small steps that normally sit in different places: sending, reading, replying, ordering and collecting payment."}
            </p>
          </div>

          <div className="feature-grid">
            {/* Card 1: Broadcast */}
            <article className="feature-card feature-card-mint">
              <div className="feature-icon" aria-hidden="true">✦</div>
              <h3>{ta ? "பிரச்சாரம்" : "Broadcast"}</h3>
              <p>
                {ta
                  ? "சரியான வாடிக்கையாளர்களுக்கு சலுகை, அறிவிப்பு அல்லது நினைவூட்டலை சில தட்டல்களில் அனுப்புங்கள்."
                  : "Send an offer, announcement or reminder to the right customers in a few taps."}
              </p>
            </article>

            {/* Card 2: Delivery & reads */}
            <article className="feature-card feature-card-cream">
              <div className="feature-icon" aria-hidden="true">◉</div>
              <h3>{ta ? "சென்றதும் படித்ததும்" : "Delivery & reads"}</h3>
              <p>
                {ta
                  ? "எத்தனை வாடிக்கையாளர்கள் செய்தியைப் பெற்றார்கள், திறந்தார்கள் என்பதைத் துல்லியமாகத் தெரிந்து கொள்ளுங்கள்."
                  : "Know how many customers actually received and opened your message."}
              </p>
            </article>

            {/* Card 3: Orders & payments */}
            <article className="feature-card feature-card-lavender">
              <div className="feature-icon" aria-hidden="true">₹</div>
              <h3>{ta ? "ஆர்டர்களும் பணமும்" : "Orders & payments"}</h3>
              <p>
                {ta
                  ? "புதிய ஆர்டர்கள், வர வேண்டிய பணம், ரொக்கம் மற்றும் பெற்ற பணத்தை ஒரே இடத்திலிருந்து கண்காணிக்கவும்."
                  : "Track new orders, payment waiting, COD and money received from one place."}
              </p>
            </article>

            {/* Card 4: Repeat sales */}
            <article className="feature-card feature-card-pink">
              <div className="feature-icon" aria-hidden="true">↻</div>
              <h3>{ta ? "மீண்டும் விற்பனை" : "Repeat sales"}</h3>
              <p>
                {ta
                  ? "மீண்டும் வாங்கக்கூடிய வாடிக்கையாளர்களைக் கண்டறிந்து, சரியான நேரத்தில் செய்தி அனுப்பி மீண்டும் வரவழையுங்கள்."
                  : "Find customers who may reorder and bring them back with a timely message."}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 3. NO CONFUSING CHARTS (Interactive Tab Switcher) ── */}
      <section className="demo-section" id="reports">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow eyebrow-yellow">{ta ? "குழப்பமான வரைபடங்கள் இல்லை" : "No confusing charts"}</div>
            <h2>{ta ? "ஒரே கேள்வி: WhatsApp வியாபாரம் கொண்டு வந்ததா?" : "Ask one question: did WhatsApp bring business?"}</h2>
            <p>
              {ta
                ? "எளிய கண்ணோட்டம், பிரச்சார முடிவு, பேமெண்ட் பார்வை என மாற்றிப் பாருங்கள். ஒவ்வொரு எண்ணுடனும் அடுத்த செயல் தெளிவுபடுத்தப்படும்."
                : "Switch between a simple overview, campaign result and payment view. Every number comes with a plain-language action."}
            </p>
          </div>

          <div className="demo-layout">
            {/* Left Tabs */}
            <div className="demo-tabs" role="tablist" aria-label={ta ? "டாஷ்போர்டு மாதிரிக் காட்சிகள்" : "Dashboard preview tabs"}>
              <button
                type="button"
                className={`demo-tab ${activeDemo === "overview" ? "active" : ""}`}
                onClick={() => setActiveDemo("overview")}
                role="tab"
                aria-selected={activeDemo === "overview"}
              >
                <strong>{ta ? "கண்ணோட்டம்" : "Overview"}</strong>
                <span>{ta ? "இன்று கவனிக்க வேண்டியவை" : "What needs attention today"}</span>
              </button>

              <button
                type="button"
                className={`demo-tab ${activeDemo === "campaign" ? "active" : ""}`}
                onClick={() => setActiveDemo("campaign")}
                role="tab"
                aria-selected={activeDemo === "campaign"}
              >
                <strong>{ta ? "பிரச்சாரங்கள்" : "Campaigns"}</strong>
                <span>{ta ? "எந்தச் செய்தி சிறப்பாக இருந்தது" : "Which message worked best"}</span>
              </button>

              <button
                type="button"
                className={`demo-tab ${activeDemo === "payments" ? "active" : ""}`}
                onClick={() => setActiveDemo("payments")}
                role="tab"
                aria-selected={activeDemo === "payments"}
              >
                <strong>{ta ? "பணம்" : "Payments"}</strong>
                <span>{ta ? "வர வேண்டிய பணம் என்ன" : "What money is waiting"}</span>
              </button>
            </div>

            {/* Right Result Panel with Smooth Transition */}
            <div className="demo-panel" role="tabpanel" key={activeDemo}>
              <div className="demo-panel-top">
                <div>
                  <h3>{demo.title[lang]}</h3>
                  <p>{demo.copy[lang]}</p>
                </div>
                <span className="demo-period">{demo.period[lang]}</span>
              </div>

              <div className="demo-metrics">
                {demo.metrics.map((m, idx) => (
                  <div key={idx} className={`demo-metric demo-metric-${m.tone ?? "default"}`}>
                    <small>{m.label[lang]}</small>
                    <strong>{m.value}</strong>
                  </div>
                ))}
              </div>

              <div className="demo-message">
                <div className="demo-message-icon" aria-hidden="true">→</div>
                <div>
                  <strong>{demo.action[lang]}</strong>
                  <span>{ta ? "தபால் அடுத்த படியை எப்போதும் தெளிவாகக் காட்டும்." : "Thabaal keeps the next step visible."}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS (3 Steps) ── */}
      <section className="steps-section" id="how-it-works">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow">{ta ? "எப்படி செயல்படுகிறது" : "How it works"}</div>
            <h2>{ta ? "யோசனை முதல் வாடிக்கையாளர் பதில் வரை மூன்றே படிகள்." : "From idea to customer reply in three steps."}</h2>
            <p>
              {ta
                ? "தபால் எளிய மொழியையும் தெளிவான பொத்தான்களையும் தருகிறது; கடை உரிமையாளர் விரைவாக தன் வேலைக்குத் திரும்பலாம்."
                : "Thabaal keeps the language familiar and the next button obvious, so the owner can get back to the shop floor."}
            </p>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <div className="step-badge">1</div>
              <span className="step-arrow" aria-hidden="true">→</span>
              <h3>{ta ? "மக்களைத் தேர்ந்தெடுங்கள்" : "Choose your people"}</h3>
              <p>
                {ta
                  ? "அனைவரையும், குறிப்பிட்ட பகுதி வாடிக்கையாளர்களை, ஒரு டேக் அல்லது குறிப்பிட்ட பொருளை வாங்கியவர்களைத் தேர்வு செய்யுங்கள்."
                  : "Pick everyone, a customer area, a tag, or people who bought a particular product."}
              </p>
            </article>

            <article className="step-card">
              <div className="step-badge">2</div>
              <span className="step-arrow" aria-hidden="true">→</span>
              <h3>{ta ? "செய்தியை அனுப்புங்கள்" : "Send your message"}</h3>
              <p>
                {ta
                  ? "WhatsApp ஒப்புதல் பெற்ற டெம்ப்ளேட்டைப் பயன்படுத்தி, சலுகையைச் சேர்த்து உடனே அல்லது நிதானமான வேகத்தில் அனுப்புங்கள்."
                  : "Use a WhatsApp-approved template, add your offer and choose now, later or a gentle sending speed."}
              </p>
            </article>

            <article className="step-card">
              <div className="step-badge">3</div>
              <span className="step-check" aria-hidden="true">✓</span>
              <h3>{ta ? "பதில்களைப் பாருங்கள்" : "See what came back"}</h3>
              <p>
                {ta
                  ? "சென்றது, படித்தது, பதில்கள், ஆர்டர்கள், பணத்தைப் பார்த்து, பரிந்துரைக்கப்பட்ட அடுத்த செயலைச் செய்யுங்கள்."
                  : "Follow delivery, reads, replies, orders and payments — then take the next suggested action."}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 5. A FAMILIAR WAY TO WORK (Quote + Personas) ── */}
      <section className="use-case-section">
        <div className="landing-container use-case-grid">
          {/* Left Quote Card */}
          <div className="use-case-main">
            <div className="eyebrow eyebrow-yellow">{ta ? "பழகிய வேலை முறை" : "A familiar way to work"}</div>
            <h3>
              {ta
                ? "“என் சலுகையை எத்தனை பேர் பார்த்தார்கள்?” என்பது கடினமான கேள்வியாக இருக்கக் கூடாது."
                : "“How many people saw my offer?” should never be a difficult question."}
            </h3>
            <p>
              {ta
                ? "அனுப்ப, பின்தொடர, புரிந்துகொள்ள உரிமையாளருக்கு ஒரே இடம். அன்றாடம் பேசும் எளிய வார்த்தைகளிலேயே டாஷ்போர்டு இருக்கும்."
                : "Thabaal gives the owner one place to send, follow up and understand. The dashboard uses the words they already use every day."}
            </p>
            <div className="use-case-bubble" aria-label={ta ? "மாதிரி அறிக்கை" : "Sample notification"}>
              <b>{ta ? "தீபாவளி சலுகை அனுப்பப்பட்டது!" : "Diwali offer sent!"}</b>
              <small>{ta ? "820 பேருக்குச் சென்றது · 610 படித்தனர் · 28 ஆர்டர்கள்" : "820 reached · 610 read · 28 orders"}</small>
            </div>
          </div>

          {/* Right 4 Personas */}
          <div className="use-case-list">
            <div className="use-case-item">
              <b>01</b>
              <div>
                <h4>{ta ? "கடை உரிமையாளருக்கு" : "For the shop owner"}</h4>
                <p>
                  {ta
                    ? "புதிய வரவுகள், பண்டிகை சலுகைகள், இருப்பு நிலவரங்களை வழக்கமான வாடிக்கையாளர்களுக்கு எளிதாக அனுப்புங்கள்."
                    : "Send new arrivals, festival offers and stock updates to regular customers."}
                </p>
              </div>
            </div>

            <div className="use-case-item">
              <b>02</b>
              <div>
                <h4>{ta ? "உணவகங்களுக்கு" : "For the restaurant"}</h4>
                <p>
                  {ta
                    ? "மந்தமான நேரங்களில் கூட்டம் சேர்க்க, இன்றைய மெனுவை பகிர, பழைய வாடிக்கையாளர்களை மீண்டும் வரவழைக்க."
                    : "Fill slow hours, share today’s menu and bring back people who ordered before."}
                </p>
              </div>
            </div>

            <div className="use-case-item">
              <b>03</b>
              <div>
                <h4>{ta ? "சேவை வணிகங்களுக்கு" : "For the service business"}</h4>
                <p>
                  {ta
                    ? "அப்பாயிண்ட்மெண்ட், புதுப்பித்தல், அடுத்த சர்வீஸ் தேதியை வாடிக்கையாளர்களுக்கு நினைவூட்ட."
                    : "Remind customers about appointments, renewals and the next service date."}
                </p>
              </div>
            </div>

            <div className="use-case-item">
              <b>04</b>
              <div>
                <h4>{ta ? "வளரும் பிராண்டுகளுக்கு" : "For the growing brand"}</h4>
                <p>
                  {ta
                    ? "பிரச்சாரச் செலவை உங்கள் குழு எளிதில் புரிந்துகொள்ளும் தெளிவான விற்பனைக் கதையாக மாற்றுங்கள்."
                    : "Turn campaign spending into a clear sales story your team can understand."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. PRICING (4 Plan Cards) ── */}
      <section className="pricing-section" id="pricing">
        <div className="landing-container">
          <div className="section-head">
            <div className="eyebrow">{ta ? "கட்டணம்" : "Pricing"}</div>
            <h2>{ta ? "உங்கள் அடுத்த கட்டத்திற்கு ஏற்ற திட்டத்தைத் தேர்வு செய்யுங்கள்." : "Pick the plan that fits your next stage."}</h2>
            <p className="pricing-note">
              {ta
                ? "கட்டண விவரங்கள் இறுதி செய்யப்படுகின்றன. திட்டப் பெயர்கள், வரம்புகள் மற்றும் செய்திச் செலவுகளுக்காக இவை ஒதுக்கப்பட்டுள்ளன."
                : "Pricing is being finalised. These four spaces are intentionally left open for the final plan names, limits and WhatsApp message costs."}
            </p>
          </div>

          <div className="pricing-grid">
            {/* Plan 01 */}
            <article className="price-card">
              <div className="plan-name">Plan 01</div>
              <p className="plan-note">{ta ? "தபாலை முயற்சித்துப் பார்க்க" : "For trying Thabaal"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில்" : "Pricing coming soon"}</div>
              <ul className="plan-features">
                <li>{ta ? "பிரச்சாரம் அனுப்புதல்" : "Campaign sending"}</li>
                <li>{ta ? "அடிப்படை டெலிவரி பார்வை" : "Basic delivery view"}</li>
                <li>{ta ? "தொடக்க வாடிக்கையாளர் பட்டியல்" : "Starter customer list"}</li>
              </ul>
            </article>

            {/* Plan 02: Featured */}
            <article className="price-card price-card-featured">
              <div className="plan-name">Plan 02</div>
              <p className="plan-note">{ta ? "தொடர்ச்சியான வாராந்திர மார்க்கெட்டிங்கிற்கு" : "For consistent weekly marketing"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில்" : "Pricing coming soon"}</div>
              <ul className="plan-features">
                <li>{ta ? "கூடுதல் பிரச்சாரங்கள்" : "More broadcasts"}</li>
                <li>{ta ? "ஆர்டர்களும் பணமும்" : "Orders and payments"}</li>
                <li>{ta ? "எளிய பிரச்சார அறிக்கைகள்" : "Simple campaign reports"}</li>
              </ul>
            </article>

            {/* Plan 03 */}
            <article className="price-card">
              <div className="plan-name">Plan 03</div>
              <p className="plan-note">{ta ? "வளரும் வாடிக்கையாளர் தளத்திற்கு" : "For a growing customer base"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில்" : "Pricing coming soon"}</div>
              <ul className="plan-features">
                <li>{ta ? "அதிக வாடிக்கையாளர் வரம்புகள்" : "Higher customer limits"}</li>
                <li>{ta ? "மீண்டும் விற்பனை கருவிகள்" : "Repeat-sale tools"}</li>
                <li>{ta ? "முன்னேறிய பிரச்சார பார்வைகள்" : "Advanced campaign views"}</li>
              </ul>
            </article>

            {/* Plan 04 */}
            <article className="price-card">
              <div className="plan-name">Plan 04</div>
              <p className="plan-note">{ta ? "குழுக்கள் மற்றும் அதிக அளவுக்கு" : "For teams and larger volume"}</p>
              <div className="price-placeholder">{ta ? "விலை விரைவில்" : "Pricing coming soon"}</div>
              <ul className="plan-features">
                <li>{ta ? "குழு பணிப்பாய்வுகள்" : "Team workflows"}</li>
                <li>{ta ? "முன்னுரிமை ஆதரவு" : "Priority support"}</li>
                <li>{ta ? "தனிப்பயன் வணிகத் தேவைகள்" : "Custom business needs"}</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* ── 7. QUESTIONS OWNERS ASK (FAQ Accordion) ── */}
      <section className="faq-section" id="faq">
        <div className="landing-container faq-grid">
          {/* Left Column */}
          <div className="faq-aside">
            <div className="eyebrow">{ta ? "உரிமையாளர்கள் கேட்கும் கேள்விகள்" : "Questions owners ask"}</div>
            <h2>{ta ? "முதல் படியை எளிதாக்குங்கள்." : "Keep the first step easy."}</h2>
            <p>
              {ta
                ? "முதல் பிரச்சாரத்தைத் தொடங்குவதற்கு முன் எழும் சந்தேகங்களைத் தீர்த்துத் தயக்கமின்றி தொடங்குங்கள்."
                : "Use this section to remove hesitation before someone creates their first campaign."}
            </p>
            <a href={TALK} target={WA ? "_blank" : undefined} rel="noopener" className="landing-btn landing-btn-dark">
              {ta ? "தபாலுடன் பேசுங்கள்" : "Talk to Thabaal"} <span aria-hidden="true">↗</span>
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
                    <span>{item.q[lang]}</span>
                    <span className="faq-toggle-icon" aria-hidden="true">+</span>
                  </button>
                  <div className="faq-answer-wrap">
                    <div className="faq-answer">
                      <p>{item.a[lang]}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA BANNER ── */}
      <section className="final-cta-section" id="start">
        <div className="landing-container final-cta-inner">
          <div className="final-cta-copy">
            <h2>{ta ? "உங்கள் செய்திக்கு இன்னும் அதிக வீச்சைத் தாருங்கள்." : "Give your message a little more reach."}</h2>
            <p>{ta ? "எளிய டெமோவுடன் தொடங்குங்கள். திட்டத்தை பின்னர் முடிவு செய்யுங்கள்." : "Start with a simple demo. Decide the plan later."}</p>
          </div>
          <a href="#top" className="landing-btn landing-btn-dark">
            {ta ? "இலவச டெமோ தொடங்குங்கள்" : "Create a free demo"} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      {/* ── 9. FULL BRAND FOOTER ── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-container">
          <div className="footer-top">
            <div className="footer-brand">
              <Image
                src="/brands/thabaal/w-night.png"
                alt="Thabaal"
                width={140}
                height={39}
                className="footer-logo"
              />
              <p>
                {ta
                  ? "வாட்ஸ்அப் பிரச்சாரங்கள், டெலிவரி, வாசிப்புகள், பணம் மற்றும் மீண்டும் விற்பனை — ஒரே அமைதியான பணியிடத்தில்."
                  : "WhatsApp broadcasts, delivery, reads, payments and repeat sales — in one calm workspace."}
              </p>
            </div>

            <nav className="footer-links" aria-label={ta ? "அடிக்குறிப்பு இணைப்புகள்" : "Footer links"}>
              <a href="#features">{ta ? "தபால் என்ன செய்யும்" : "Features"}</a>
              <a href="#reports">{ta ? "அறிக்கைகள்" : "Reports"}</a>
              <a href="#pricing">{ta ? "கட்டணம்" : "Pricing"}</a>
              <a href="/privacy">{ta ? "தனியுரிமைக் கொள்கை" : "Privacy Policy"}</a>
              <a href="/terms">{ta ? "சேவை விதிமுறைகள்" : "Terms of Service"}</a>
              <a href="/about">{ta ? "தபால் பற்றி" : "About Thabaal"}</a>
            </nav>
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Thabaal. {ta ? "வளரும் வணிகங்களுக்காக உருவாக்கப்பட்டது." : "Built for growing businesses."}</span>
            <span>{ta ? "எளிய முறையில் WhatsApp மார்க்கெட்டிங்." : "WhatsApp marketing made simple."}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
