"use client";

import { Info } from "@/components/icons";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/context";

const TITLE_TA_MAP: Record<string, { title: string; desc?: string }> = {
  "Orders": { title: "ஆர்டர்கள்", desc: "WhatsApp கார்ட்கள் மற்றும் வாடிக்கையாளர் ஆர்டர்கள்" },
  "Customers": { title: "வாடிக்கையாளர்கள்", desc: "வாடிக்கையாளர்கள் தொடர்பு மற்றும் லாயல்டி" },
  "Chats & Replies": { title: "உரையாடல்கள்", desc: "வாடிக்கையாளர் WhatsApp செய்திகள் மற்றும் கார்ட் விவரங்கள்" },
  "Replies": { title: "உரையாடல்கள்", desc: "வாடிக்கையாளர் WhatsApp செய்திகள் மற்றும் கார்ட் விவரங்கள்" },
  "Campaigns": { title: "பிரச்சாரங்கள்", desc: "சலுகைகள், வாழ்த்துகள் மற்றும் மறு ஆர்டர் நினைவூட்டல்கள்" },
  "Products & Catalogue": { title: "பொருட்கள் & பட்டியல்", desc: "நேரலை WhatsApp பட்டியல், இருப்பு மற்றும் விலைகள்" },
  "Catalogue": { title: "பொருட்கள் & பட்டியல்", desc: "நேரலை WhatsApp பட்டியல், இருப்பு மற்றும் விலைகள்" },
  "Products": { title: "பொருட்கள் & பட்டியல்", desc: "நேரலை WhatsApp பட்டியல், இருப்பு மற்றும் விலைகள்" },
  "Templates": { title: "Meta டெம்ப்ளேட்கள்", desc: "பிரச்சாரங்கள் மற்றும் அறிவிப்புகளுக்கான டெம்ப்ளேட்கள்" },
  "Meta Message Templates": { title: "Meta டெம்ப்ளேட்கள்", desc: "பிரச்சாரங்கள் மற்றும் அறிவிப்புகளுக்கான டெம்ப்ளேட்கள்" },
  "Money & Revenue": { title: "பணம் & வருமானம்", desc: "தினசரி வசூல், ரொக்கம் மற்றும் UPI வரவுகள்" },
  "Revenue": { title: "பணம் & வருமானம்", desc: "தினசரி வசூல், ரொக்கம் மற்றும் UPI வரவுகள்" },
  "Reports & Analytics": { title: "அறிக்கைகள் & பகுப்பாய்வு", desc: "விற்பனை விவரங்கள், ஆர்டர் நிலைகள் மற்றும் பிரச்சார பலன்கள்" },
  "Reports": { title: "அறிக்கைகள் & பகுப்பாய்வு", desc: "விற்பனை விவரங்கள், ஆர்டர் நிலைகள் மற்றும் பிரச்சார பலன்கள்" },
  "Settings": { title: "அமைப்புகள்", desc: "கடை விவரங்கள், WhatsApp இணைப்பு, அமைதி நேரம் மற்றும் மொழி" },
  "Wallets": { title: "வாலட்கள்", desc: "WhatsApp கட்டணங்களுக்கான வணிக வாலட்கள்" },
  "Wallet": { title: "வாலட்", desc: "WhatsApp கட்டணங்களுக்கான வணிக வாலட்" },
  "Notifications": { title: "அறிவிப்புகள்", desc: "வாடிக்கையாளர் செய்திகள், ஆர்டர்கள் மற்றும் முக்கிய நிகழ்வுகள்" },
  "Message log": { title: "செய்திப் பதிவு", desc: "அனுப்பப்பட்ட அனைத்து வாடிக்கையாளர் செய்திகள்" },
  "Audiences": { title: "வாடிக்கையாளர் பிரிவுகள்", desc: "சேமிக்கப்பட்ட வாடிக்கையாளர் குழுக்கள்" },
  "Get more customers": { title: "புதிய வாடிக்கையாளர்கள்", desc: "வாடிக்கையாளர்களை ஈர்க்கும் QR குறியீடுகள்" },
  "Google Sheet sync": { title: "Google Sheets நேரலை இணைப்பு", desc: "Google Sheets வாடிக்கையாளர்கள் மற்றும் ஆர்டர்கள் ஒத்திசைவு" },
  "Custom fields": { title: "கூடுதல் விவரங்கள்", desc: "வாடிக்கையாளர்கள் மற்றும் ஆர்டர்களுக்கான தனிப்பயன் புலங்கள்" },
};

/**
 * The page title and its description. Computers always show the description; phones fold
 * it behind an info button so the page's content starts within the first screen.
 */
export function PageInfo({
  title,
  description,
  titleTa,
  descriptionTa,
}: {
  title: string;
  description?: ReactNode;
  titleTa?: string;
  descriptionTa?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { lang } = useLanguage();

  const isTa = lang === "ta";
  const mapped = TITLE_TA_MAP[title];
  const displayTitle = isTa ? (titleTa ?? mapped?.title ?? title) : title;
  const displayDescription = isTa
    ? (descriptionTa ?? (typeof description === "string" ? (mapped?.desc ?? description) : description))
    : description;

  return (
    <>
      <div className="flex items-center gap-1 sm:items-start">
        <h1 style={{ minWidth: 0, overflowWrap: "anywhere" }}>{displayTitle}</h1>
        {displayDescription && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-label={open ? (isTa ? "பக்க விளக்கத்தை மறைக்க" : "Hide page description") : (isTa ? "இந்த பக்கத்தைப் பற்றி" : "About this page")}
            onClick={() => setOpen(!open)}
            className={cn("-my-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-full transition active:bg-sunken sm:hidden print:hidden", open ? "text-brand-deep" : "text-muted")}
          >
            <Info aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {displayDescription && (
        <p id={id} className={cn("sub", !open && "max-sm:hidden")}>
          {displayDescription}
        </p>
      )}
    </>
  );
}
