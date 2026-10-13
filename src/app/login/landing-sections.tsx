import Image from "next/image";
import { BellRing, CalendarClock, Clock, Globe, Inbox, Megaphone, Phone, QrCode, Repeat, Sheet, ShieldCheck, Smartphone, Users, Wallet } from "@/components/icons";
import "./landing.css";

type Lang = "en" | "ta";
type T = { en: string; ta: string };

/** Where "Talk to us" goes: a WhatsApp number (digits with country code) or an email, set in the environment. */
const WA = (process.env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
const MAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "";
const TALK = WA
  ? `https://wa.me/${WA}?text=${encodeURIComponent("Hi Thabaal, I'd like a demo for my business.")}`
  : MAIL
    ? `mailto:${MAIL}?subject=${encodeURIComponent("Thabaal demo")}`
    : null;

const STAMPS: { title: T; text: T }[] = [
  {
    title: { en: "Official WhatsApp API", ta: "அதிகாரப்பூர்வ WhatsApp API" },
    text: { en: "Your own verified business number on Meta's Cloud API.", ta: "Meta Cloud API-இல் உங்கள் சொந்த சரிபார்க்கப்பட்ட வணிக எண்." },
  },
  {
    title: { en: "No markup on messages", ta: "செய்திக் கட்டணத்தில் கூடுதல் இல்லை" },
    text: { en: "You pay Meta's per-message rate, nothing added on top.", ta: "Meta வசூலிக்கும் கட்டணம் மட்டுமே; மேலே எதுவும் சேர்க்கப்படாது." },
  },
  {
    title: { en: "Tamil and English", ta: "தமிழ் மற்றும் ஆங்கிலம்" },
    text: { en: "Templates, replies and your catalogue in both languages.", ta: "டெம்ப்ளேட், பதில்கள், கேட்டலாக் இரண்டு மொழிகளிலும்." },
  },
];

const JOURNEY: { title: T; text: T }[] = [
  {
    title: { en: "Send", ta: "அனுப்பு" },
    text: {
      en: "Schedule an offer or price list to the right customers. It goes out in batches and waits out quiet hours.",
      ta: "சரியான வாடிக்கையாளர்களுக்கு சலுகை அல்லது விலைப் பட்டியலை திட்டமிடுங்கள். தொகுதிகளாகச் சென்று, அமைதி நேரத்தைத் தவிர்க்கும்.",
    },
  },
  {
    title: { en: "Cart", ta: "கார்ட்" },
    text: {
      en: "Customers browse your WhatsApp catalogue and send a cart. It lands in Orders with their address and history.",
      ta: "வாடிக்கையாளர் WhatsApp கேட்டலாக்கில் பார்த்து கார்ட் அனுப்புவார். அது முகவரி, வரலாற்றுடன் ஆர்டர்களில் வரும்.",
    },
  },
  {
    title: { en: "Pay", ta: "பணம்" },
    text: {
      en: "They pay by UPI inside the chat or choose cash on delivery. Screenshots, part payments and refunds are tracked.",
      ta: "சாட்டிலேயே UPI மூலம் செலுத்தலாம் அல்லது டெலிவரியில் பணம். ஸ்கிரீன்ஷாட், பகுதி கட்டணம், திருப்பித் தருதல் அனைத்தும் கணக்கில்.",
    },
  },
  {
    title: { en: "Ship", ta: "ஷிப்பிங்" },
    text: {
      en: "Paid orders are ready to ship, and the customer gets a dispatch update on WhatsApp automatically.",
      ta: "பணம் செலுத்திய ஆர்டர்கள் அனுப்பத் தயார்; வாடிக்கையாளருக்கு WhatsApp-இல் தானாகவே அனுப்பிய தகவல் போகும்.",
    },
  },
  {
    title: { en: "Deliver", ta: "டெலிவரி" },
    text: {
      en: "Mark it delivered and collect cash. A reorder reminder goes out when they are likely to run low.",
      ta: "டெலிவரி செய்ததாகக் குறித்து பணம் பெறுங்கள். பொருள் தீரும் நேரத்தில் மீண்டும் வாங்க நினைவூட்டல் போகும்.",
    },
  },
];

const MORE: { Icon: typeof Inbox; title: T; text: T }[] = [
  { Icon: Inbox, title: { en: "Replies inbox", ta: "பதில்கள்" }, text: { en: "Chats sorted by who is waiting longest and who has a cart open.", ta: "நீண்ட நேரம் காத்திருப்பவர், கார்ட் வைத்திருப்பவர் முதலில்." } },
  { Icon: Phone, title: { en: "WhatsApp calls", ta: "WhatsApp அழைப்புகள்" }, text: { en: "Take and place calls from the portal, with missed calls to follow up.", ta: "போர்ட்டலிலிருந்தே அழைக்கலாம், தவறிய அழைப்புகளைப் பின்தொடரலாம்." } },
  { Icon: Sheet, title: { en: "Google Sheets", ta: "Google Sheets" }, text: { en: "Bring in customers from your sheets and keep orders flowing back.", ta: "ஷீட்டிலிருந்து வாடிக்கையாளர்கள் உள்ளே, ஆர்டர்கள் மீண்டும் ஷீட்டுக்கு." } },
  { Icon: Users, title: { en: "Audiences", ta: "குழுக்கள்" }, text: { en: "Save groups like repeat buyers in your area and send in one tap.", ta: "‘உங்கள் பகுதியில் மீண்டும் வாங்குபவர்கள்’ போன்ற குழுக்களுக்கு ஒரே தட்டலில்." } },
  { Icon: Repeat, title: { en: "Reorder reminders", ta: "மீண்டும் வாங்க நினைவூட்டல்" }, text: { en: "A nudge when a customer is likely to need more.", ta: "வாடிக்கையாளருக்கு மீண்டும் தேவைப்படும் நேரத்தில் ஒரு நினைவூட்டல்." } },
  { Icon: Globe, title: { en: "Two languages", ta: "இரு மொழிகள்" }, text: { en: "Work in தமிழ் or English, switch any time.", ta: "தமிழ் அல்லது ஆங்கிலம், எப்போது வேண்டுமானாலும் மாற்றலாம்." } },
  { Icon: Smartphone, title: { en: "Works on your phone", ta: "மொபைலில் இயங்கும்" }, text: { en: "Install it like an app; every screen fits one hand.", ta: "ஆப் போல நிறுவலாம்; ஒரு கையில் பயன்படுத்தலாம்." } },
  { Icon: ShieldCheck, title: { en: "Your team, your data", ta: "உங்கள் குழு, உங்கள் தரவு" }, text: { en: "Logins for owners, managers and staff, each seeing what they need.", ta: "உரிமையாளர், மேலாளர், ஊழியர்களுக்கு தனி லாகின்." } },
];

const FAQ: { q: T; a: T }[] = [
  {
    q: { en: "Is this the official WhatsApp API?", ta: "இது அதிகாரப்பூர்வ WhatsApp API-யா?" },
    a: {
      en: "Yes. Thabaal sends through Meta's WhatsApp Cloud API on your own verified business number, with the templates and catalogue Meta supports.",
      ta: "ஆம். உங்கள் சரிபார்க்கப்பட்ட வணிக எண்ணில் Meta-வின் WhatsApp Cloud API மூலமே தபால் அனுப்புகிறது.",
    },
  },
  {
    q: { en: "What do messages cost?", ta: "செய்திகளுக்கு என்ன கட்டணம்?" },
    a: {
      en: "Meta charges per delivered template message and you pay that rate as it is: ₹0.8631 for marketing and ₹0.115 for utility messages to Indian numbers (October 2026, before GST). Replies within 24 hours of a customer writing to you are free for the first 1,000 a month.",
      ta: "Meta வசூலிக்கும் கட்டணத்தையே செலுத்துவீர்கள்: இந்திய எண்களுக்கு மார்க்கெட்டிங் ₹0.8631, யூட்டிலிட்டி ₹0.115 (அக்டோபர் 2026, GST தவிர). வாடிக்கையாளர் எழுதிய 24 மணி நேரத்திற்குள் பதில்கள் மாதம் முதல் 1,000 இலவசம்.",
    },
  },
  {
    q: { en: "Can I keep my current WhatsApp number?", ta: "என் தற்போதைய எண்ணையே வைத்துக்கொள்ளலாமா?" },
    a: {
      en: "A number can be on the WhatsApp Business app or the API, not both at once. We help you move it, or set up a new number for campaigns while you keep chatting on the old one.",
      ta: "ஒரு எண் Business ஆப் அல்லது API — ஏதாவது ஒன்றில் மட்டுமே. அதை மாற்ற உதவுவோம், அல்லது பழைய எண்ணை வைத்துக்கொண்டு புதிய எண்ணில் பிரச்சாரம் செய்யலாம்.",
    },
  },
  {
    q: { en: "Do I need a website?", ta: "இணையதளம் தேவையா?" },
    a: {
      en: "No. Your products live in a WhatsApp catalogue that customers browse inside the chat, and Thabaal turns their carts into orders.",
      ta: "இல்லை. உங்கள் பொருட்கள் WhatsApp கேட்டலாக்கில் இருக்கும்; வாடிக்கையாளர் கார்ட்டை தபால் ஆர்டராக மாற்றும்.",
    },
  },
  {
    q: { en: "How long does setup take?", ta: "தொடங்க எவ்வளவு நாள் ஆகும்?" },
    a: {
      en: "Most businesses are sending within a few days. Meta's business verification is usually the slowest step, and we walk you through it.",
      ta: "பெரும்பாலான வணிகங்கள் சில நாட்களில் அனுப்பத் தொடங்குகின்றன. Meta வணிகச் சரிபார்ப்பே அதிக நேரம் எடுக்கும்; அதிலும் உதவுவோம்.",
    },
  },
];

const ticks = (
  <svg viewBox="0 0 18 11" aria-hidden className="tl-ticks">
    <path d="M1 6l3 3 6-7M7 9l1 1 6-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Talk({ lang, className = "" }: { lang: Lang; className?: string }) {
  const ta = lang === "ta";
  if (!TALK) {
    return (
      <a href="#top" className={`tl-btn tl-btn-main ${className}`}>
        {ta ? "உள்நுழைக" : "Sign in"}
      </a>
    );
  }
  return (
    <a href={TALK} target={WA ? "_blank" : undefined} rel="noopener" className={`tl-btn tl-btn-main ${className}`}>
      {WA ? (ta ? "WhatsApp-இல் பேசுங்கள்" : "Chat with us on WhatsApp") : ta ? "டெமோவுக்கு மின்னஞ்சல்" : "Email us for a demo"}
    </a>
  );
}

/** The sections under the sign-in hero: what Thabaal does, in the sign-in page's own look. */
export function LandingSections({ lang }: { lang: Lang }) {
  const ta = lang === "ta";
  const t = (x: T) => x[lang];

  return (
    <div className="tl" id="explore">
      {/* ── Intro + stamps ── */}
      <section className="tl-section tl-intro">
        <div className="tl-wrap">
          <h2>{ta ? "முதல் வணக்கம் முதல் பணம் செலுத்திய ஆர்டர் வரை, ஒரே WhatsApp சாட்டில்." : "From the first hello to a paid order, in one WhatsApp chat."}</h2>
          <p className="tl-lede">
            {ta
              ? "சலுகைகள், கேட்டலாக், கார்ட், UPI மற்றும் டெலிவரியில் பணம், டெலிவரி தகவல்கள், பதில்கள் — அனைத்தையும் தபால் கவனிக்கும். ஒவ்வொரு செய்தியும் எவ்வளவு வருமானம் தந்தது என்றும் காட்டும்."
              : "Thabaal runs your offers, catalogue, carts, UPI and cash-on-delivery payments, delivery updates and replies, and shows you what each message earned."}
          </p>
          <ul className="tl-stamps">
            {STAMPS.map((s) => (
              <li key={s.title.en} className="tl-stamp">
                <b>{t(s.title)}</b>
                <span>{t(s.text)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Journey: a real sequence, so it is numbered ── */}
      <section className="tl-section tl-journey-sec" id="how">
        <div className="tl-wrap">
          <h2>{ta ? "ஒரு ஆர்டர், ஐந்து படிகள்" : "One order, five steps"}</h2>
          <p className="tl-sub">{ta ? "வாடிக்கையாளர் WhatsApp-ஐ விட்டு வெளியே வர வேண்டியதில்லை." : "Your customer never leaves WhatsApp. You follow every step on your phone or computer."}</p>
          <ol className="tl-journey">
            {JOURNEY.map((s, i) => (
              <li key={s.title.en}>
                <span className="tl-env" aria-hidden>
                  <svg viewBox="0 0 40 28">
                    <rect x="1.5" y="1.5" width="37" height="25" rx="5" />
                    <path d="M4 5l16 12L36 5" />
                  </svg>
                  <i>{i + 1}</i>
                </span>
                <h3>{t(s.title)}</h3>
                <p>{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Feature rows ── */}
      <section className="tl-section" id="features">
        <div className="tl-wrap">
          <article className="tl-row">
            <div className="tl-row-copy">
              <h2>{ta ? "உங்கள் எண்ணைப் பாதுகாக்கும் பிரச்சாரங்கள்" : "Campaigns that keep your number healthy"}</h2>
              <p>
                {ta
                  ? "யாருக்கு, எப்போது, எவ்வளவு வேகமாக என்று தேர்வு செய்யுங்கள். சமீபத்தில் செய்தி பெற்றவர்களைத் தவிர்க்கும், இரவில் மார்க்கெட்டிங் அனுப்பாது, Meta நிறுத்திய செய்திகளை மீண்டும் முயலும்."
                  : "Pick who gets the message, when and how fast. Thabaal skips anyone who heard from you recently, holds marketing at night and retries messages Meta held back, so your quality rating stays green."}
              </p>
              <ul className="tl-points">
                <li>
                  <CalendarClock /> {ta ? "ஒருமுறை, வாரம், வார நாட்கள் அல்லது நீங்கள் தேர்வு செய்யும் நாட்கள்" : "Once, weekly, weekdays or any days you pick"}
                </li>
                <li>
                  <Clock /> {ta ? "அமைதி நேரம், ஒவ்வொருவருக்கும் சலுகை இடைவெளி" : "Quiet hours and a gap between offers for each customer"}
                </li>
                <li>
                  <Megaphone /> {ta ? "ஒவ்வொரு பிரச்சாரத்திற்கும் சென்றது, படித்தது, பதிலளித்தது" : "Delivered, read and replied for every campaign and product"}
                </li>
              </ul>
            </div>
            <div className="tl-card tl-campaign" aria-hidden>
              <p className="tl-card-title">{ta ? "வாராந்திர சலுகைகள்" : "Weekly offers"}</p>
              <p className="tl-card-meta">{ta ? "ஒவ்வொரு செவ், வெள்ளி காலை 10 மணி" : "Every Tue and Fri at 10:00 am"}</p>
              {[
                [ta ? "அனுப்பியது" : "Sent", 526, 100],
                [ta ? "சென்றது" : "Delivered", 484, 92],
                [ta ? "படித்தது" : "Read", 384, 73],
                [ta ? "பதில்" : "Replied", 95, 18],
              ].map(([label, n, w]) => (
                <div key={String(label)} className="tl-bar">
                  <span>{label}</span>
                  <i style={{ width: `${w}%` }} />
                  <b>{n}</b>
                </div>
              ))}
              <p className="tl-card-note">{ta ? "உதாரண எண்கள்" : "Example figures"}</p>
            </div>
          </article>

          <article className="tl-row tl-flip">
            <div className="tl-row-copy">
              <h2>{ta ? "வாடிக்கையாளருக்குப் பிடித்த வழியில் பணம்" : "Get paid the way your customers like to pay"}</h2>
              <p>
                {ta
                  ? "சாட்டிலேயே UPI கோரிக்கை, டெலிவரியில் பணம், அல்லது நேரில் பெற்றதைப் பதிவு செய்யுங்கள். UTR எண் அல்லது ஸ்கிரீன்ஷாட் வந்தால் நீங்கள் சரிபார்க்கக் காத்திருக்கும்."
                  : "Send a UPI request inside the chat, take cash on delivery, or record a payment made in person. When a customer sends a UTR number or screenshot, it waits for you to verify, so the cash in hand matches your orders."}
              </p>
              <ul className="tl-points">
                <li>
                  <QrCode /> {ta ? "WhatsApp UPI, உங்கள் QR, ரொக்கம், டெலிவரியில் பணம்" : "UPI on WhatsApp, your QR code, cash or cash on delivery"}
                </li>
                <li>
                  <Wallet /> {ta ? "சரிபார்க்க வேண்டியவை, திருப்பித் தர வேண்டியவை, நிலுவை" : "Payments to check, refunds due and money still owed"}
                </li>
                <li>
                  <BellRing /> {ta ? "பணம் நிலுவையில் இருந்தால் தானாக நினைவூட்டல்" : "An automatic reminder when a payment is still pending"}
                </li>
              </ul>
            </div>
            {/* An example chat with a made-up store: cart, payment and dispatch. */}
            <figure className="tl-chat" aria-label={ta ? "உதாரண WhatsApp சாட்" : "Example WhatsApp chat: a cart, a UPI payment and a dispatch update"}>
              <div className="tl-chat-top">
                <span aria-hidden>FM</span>
                <div className="tl-chat-name">
                  <b>
                    Fresh Mart
                    <svg viewBox="0 0 24 24" className="tl-verified" role="img" aria-label={ta ? "சரிபார்க்கப்பட்ட வணிகம்" : "Verified business"}>
                      <path d="M12 1.5l2.4 1.8 3-.2 1 2.8 2.6 1.6-.8 2.9 1.3 2.7-2.2 2 .1 3-2.9.7-1.5 2.6-2.9-.9-2.6 1.4L10 20.3l-3 .2-1-2.8-2.6-1.6.8-2.9L2.9 10.6l2.2-2-.1-3 2.9-.7 1.5-2.6 2.9.9z" fill="#1d9bf0" />
                      <path d="M7.6 12.2l3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </b>
                  <small>{ta ? "வணிகக் கணக்கு" : "Business account"}</small>
                </div>
              </div>
              <ol>
                <li className="tl-msg tl-out">
                  <span className="tl-cart">
                    <b>{ta ? "கார்ட் · 3 பொருட்கள்" : "Cart · 3 items"}</b>
                    Basmati rice 5kg, Toor dal 1kg, Coffee powder 500g
                  </span>
                  <time>10:06 {ticks}</time>
                </li>
                <li className="tl-msg tl-in">
                  {ta ? "ஆர்டர் #1024 தயார். டெலிவரியுடன் மொத்தம் ₹1,050." : "Order #1024 is ready. Total ₹1,050 with delivery."}
                  <span className="tl-msg-btn">{ta ? "பார்த்து செலுத்துக" : "Review and pay"}</span>
                  <time>10:06</time>
                </li>
                <li className="tl-msg tl-out tl-paid">
                  {ta ? "UPI மூலம் ₹1,050 செலுத்தப்பட்டது" : "Paid ₹1,050 by UPI"}
                  <time>10:07 {ticks}</time>
                </li>
                <li className="tl-msg tl-in">
                  {ta ? "பணம் கிடைத்தது, நன்றி! உங்கள் ஆர்டர் அனுப்பப்பட்டது; மாலைக்குள் வரும்." : "Payment received, thank you! Your order is on its way and will arrive by evening."}
                  <time>16:40</time>
                </li>
              </ol>
            </figure>
          </article>

          <article className="tl-row">
            <div className="tl-row-copy">
              <h2>{ta ? "ஒவ்வொரு செய்தியும் என்ன தந்தது என்று தெரியும்" : "Know what each message earned"}</h2>
              <p>
                {ta
                  ? "விற்பனை vs கையில் வந்த பணம், எந்தப் பொருட்கள் விற்கின்றன, எவை கார்ட்டிலிருந்து நீக்கப்படுகின்றன, யாருக்கு மீண்டும் வாங்கும் நேரம் — அனைத்தும் உங்கள் கேட்டலாக் பொருட்களின் அடிப்படையில்."
                  : "See sales against cash received, which products people buy and which they drop from their carts, and who is due for a reorder. Products come straight from your catalogue, so the numbers match what you sell."}
              </p>
            </div>
            <div className="tl-card tl-stats" aria-hidden>
              {[
                [ta ? "இந்த வார விற்பனை" : "Sales this week", "₹2,073"],
                [ta ? "படித்த விகிதம்" : "Read rate", "79%"],
                [ta ? "மீட்க வேண்டிய கார்ட்" : "Carts to recover", "₹1,390"],
                [ta ? "மீண்டும் வாங்க" : "Reorders due", "12"],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <b>{v}</b>
                </div>
              ))}
              <p className="tl-card-note">{ta ? "உதாரண எண்கள்" : "Example figures"}</p>
            </div>
          </article>

          <ul className="tl-more">
            {MORE.map(({ Icon, title, text }) => (
              <li key={title.en}>
                <span className="tl-more-icon" aria-hidden>
                  <Icon />
                </span>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="tl-section tl-pricing" id="pricing">
        <div className="tl-wrap tl-pricing-grid">
          <div>
            <h2>{ta ? "ஒவ்வொரு செய்திக்கும் Meta கட்டணம் மட்டுமே" : "Pay Meta's rate for every message, nothing added"}</h2>
            <p className="tl-sub">
              {ta
                ? "பல WhatsApp கருவிகள் Meta கட்டணத்திற்கு மேல் 10–26% சேர்க்கின்றன. தபால் சேர்ப்பதில்லை. உங்கள் வணிகத்திற்கு ஏற்ற திட்டத்தைச் சொல்வோம்."
                : "Many WhatsApp tools add 10–26% on top of Meta's per-message charge. Thabaal doesn't. Tell us about your business and we'll quote a plan that fits."}
            </p>
            <Talk lang={lang} />
          </div>
          <div className="tl-table-wrap">
            <table className="tl-rates">
              <caption>{ta ? "இந்திய எண்களுக்கு Meta கட்டணம், ஒரு செய்திக்கு (அக்டோபர் 2026, GST தவிர)" : "Meta's rates for Indian numbers, per delivered message (October 2026, before GST)"}</caption>
              <thead>
                <tr>
                  <th scope="col">{ta ? "செய்தி" : "Message"}</th>
                  <th scope="col">{ta ? "எதற்கு" : "Used for"}</th>
                  <th scope="col">{ta ? "கட்டணம்" : "Rate"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{ta ? "மார்க்கெட்டிங்" : "Marketing"}</th>
                  <td>{ta ? "சலுகைகள், புதிய வரவுகள், விலைப் பட்டியல்" : "Offers, new arrivals, price lists"}</td>
                  <td>₹0.8631</td>
                </tr>
                <tr>
                  <th scope="row">{ta ? "யூட்டிலிட்டி" : "Utility"}</th>
                  <td>{ta ? "ஆர்டர், பணம், அனுப்புதல் தகவல்கள்" : "Order, payment and dispatch updates"}</td>
                  <td>₹0.115</td>
                </tr>
                <tr>
                  <th scope="row">{ta ? "சேவை" : "Service"}</th>
                  <td>{ta ? "வாடிக்கையாளர் எழுதிய 24 மணி நேரத்திற்குள் பதில்" : "Replies within 24 hours of the customer writing"}</td>
                  <td>{ta ? "மாதம் முதல் 1,000 இலவசம்" : "First 1,000 a month free"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="tl-section" id="faq">
        <div className="tl-wrap tl-faq">
          <h2>{ta ? "வணிக உரிமையாளர்கள் கேட்கும் கேள்விகள்" : "Questions business owners ask"}</h2>
          {FAQ.map((f) => (
            <details key={f.q.en}>
              <summary>{t(f.q)}</summary>
              <p>{t(f.a)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Closing sky ── */}
      <section className="tl-close">
        <div className="tl-close-sky" aria-hidden />
        <div className="tl-wrap tl-close-inner">
          <Image src="/brands/thabaal/mark.png" alt="" width={150} height={83} className="tl-close-bird" />
          <h2>{ta ? "உங்கள் வாடிக்கையாளர்கள் ஏற்கனவே WhatsApp-இல் உள்ளனர். அங்கேயே ஆர்டர் செய்யட்டும்." : "Your customers are already on WhatsApp. Let them order there."}</h2>
          <div className="tl-actions">
            <Talk lang={lang} />
            {TALK && (
              <a href="#top" className="tl-btn tl-btn-ghost">
                {ta ? "உள்நுழைக" : "Sign in"}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="tl-footer">
        <div className="tl-wrap tl-footer-row">
          <span lang="ta">தபால் · Thabaal</span>
          <span>{ta ? "WhatsApp என்பது Meta Platforms, Inc.-இன் வர்த்தகக் குறி." : "WhatsApp is a trademark of Meta Platforms, Inc. Thabaal uses the official WhatsApp Cloud API."}</span>
        </div>
      </footer>
    </div>
  );
}
