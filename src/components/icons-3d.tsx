import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type Icon3DProps = SVGProps<SVGSVGElement>;

function Base3D({ className, children, ...props }: Icon3DProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("size-4 shrink-0 select-none", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 3D Layered Bento Dashboard Icon — High Brightness & Luminous Contrast */
export function Dashboard3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back 3D extruded depth layer */}
      <rect x="2.2" y="3.2" width="8.8" height="9.8" rx="2.5" fill="currentColor" fillOpacity="0.65" />
      <rect x="13" y="11.2" width="8.8" height="9.8" rx="2.5" fill="currentColor" fillOpacity="0.65" />
      {/* Main bright front tile (Top-Left) */}
      <rect x="2.2" y="2.2" width="8.8" height="9.5" rx="2.5" fill="#ffffff" />
      <rect x="4" y="4.2" width="5.2" height="2" rx="1" fill="#0f172a" fillOpacity="0.45" />
      <rect x="4" y="7.4" width="3.5" height="1.8" rx="0.9" fill="#0f172a" fillOpacity="0.28" />
      {/* Floating top-right radiant gold 3D stat cube */}
      <rect x="13" y="2.2" width="8.8" height="6.6" rx="2.3" fill="#fde047" />
      <circle cx="19" cy="5.5" r="1.4" fill="#0f172a" fillOpacity="0.45" />
      <path d="M14.8 5.5h2.2" stroke="#0f172a" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
      {/* Bottom-left bright secondary tile */}
      <rect x="2.2" y="13.8" width="8.8" height="7.8" rx="2.3" fill="#ffffff" fillOpacity="0.88" />
      <path d="M4.5 17.7h4.2" stroke="#0f172a" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
      {/* Bottom-right tall chart tile */}
      <rect x="13" y="10.4" width="8.8" height="11.2" rx="2.5" fill="#ffffff" />
      <rect x="15" y="16" width="1.7" height="3.6" rx="0.8" fill="#0f172a" fillOpacity="0.45" />
      <rect x="18" y="13" width="1.7" height="6.6" rx="0.8" fill="#f59e0b" />
    </Base3D>
  );
}

/** 3D Sculpted Notification Bell with Glowing Badge */
export function Bell3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Clapper orb */}
      <path d="M9.2 18.8a2.8 2.8 0 0 0 5.6 0H9.2Z" fill="#fde047" />
      {/* Main bright bell dome */}
      <path
        d="M12 2.8a6.2 6.2 0 0 0-6.2 6.2v3.8c0 .9-.36 1.76-1 2.4L3.8 16.2h16.4l-1-1a3.4 3.4 0 0 1-1-2.4V9A6.2 6.2 0 0 0 12 2.8Z"
        fill="#ffffff"
      />
      {/* High-contrast inner specular groove */}
      <path
        d="M8.4 8.6A3.8 3.8 0 0 1 12 5.2"
        stroke="#0f172a"
        strokeOpacity="0.4"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Front bevelled base plate */}
      <rect x="3" y="15.2" width="18" height="2.8" rx="1.4" fill="#ffffff" />
      <rect x="5" y="16.1" width="14" height="1" rx="0.5" fill="#0f172a" fillOpacity="0.25" />
      {/* Radiant 3D notification orb */}
      <circle cx="18" cy="5.5" r="3.4" fill="#fb7185" />
      <circle cx="18" cy="5.5" r="1.5" fill="#ffffff" />
    </Base3D>
  );
}

/** 3D Shopping Bag with Gusset Depth & Handles */
export function ShoppingBag3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back bag fold */}
      <path d="M5.5 7.2h13l1.3 12a2.5 2.5 0 0 1-2.5 2.8H6.7a2.5 2.5 0 0 1-2.5-2.8l1.3-12Z" fill="#ffffff" fillOpacity="0.7" />
      {/* Back handle */}
      <path d="M8.8 7.2V5.5a3.2 3.2 0 0 1 6.4 0v1.7" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
      {/* Main bright front bag body */}
      <path d="M4.6 7h14.8l1.1 11.6A2.5 2.5 0 0 1 18 21.2H6a2.5 2.5 0 0 1-2.5-2.6L4.6 7Z" fill="#ffffff" />
      {/* Top fold crease */}
      <path d="M4.8 7h14.4l.2 2.2H4.6L4.8 7Z" fill="#0f172a" fillOpacity="0.18" />
      {/* Handle grommets */}
      <circle cx="8.5" cy="9.5" r="1.2" fill="#0f172a" fillOpacity="0.5" />
      <circle cx="15.5" cy="9.5" r="1.2" fill="#0f172a" fillOpacity="0.5" />
      {/* Front 3D handle */}
      <path d="M8.5 9.2V5.8a3.5 3.5 0 0 1 7 0v3.4" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      {/* Radiant gold price tag emblem */}
      <rect x="12.5" y="13.5" width="5.2" height="3.6" rx="1" fill="#f59e0b" />
    </Base3D>
  );
}

/** 3D Storefront / Catalogue Awning Icon */
export function Store3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Shop base building */}
      <rect x="4" y="10" width="16" height="11.2" rx="2.2" fill="#ffffff" fillOpacity="0.92" />
      {/* Shop window & door */}
      <rect x="6.2" y="12.8" width="5.2" height="5" rx="1.1" fill="#0ea5e9" />
      <rect x="13.2" y="12.8" width="4.4" height="8.4" rx="1.1" fill="#0f172a" fillOpacity="0.55" />
      {/* 3D Awning roof */}
      <path d="M4 3.2h16l1.8 5.5H2.2L4 3.2Z" fill="#ffffff" />
      {/* High-contrast awning stripes */}
      <path d="M8.5 3.4 7.4 8.7M12 3.4v5.3M15.5 3.4l1.1 5.3" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" />
      {/* Scalloped 3D awning valance */}
      <path d="M2.2 8.7a2.45 2.45 0 0 0 4.9 0 2.45 2.45 0 0 0 4.9 0 2.45 2.45 0 0 0 4.9 0 2.45 2.45 0 0 0 4.9 0H2.2Z" fill="#fde047" />
    </Base3D>
  );
}

/** 3D Inbox Tray with Incoming Message Card */
export function Inbox3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back tray wall */}
      <path d="M4.8 4.5h14.4l2.5 9v5A2.5 2.5 0 0 1 19.2 21H4.8a2.5 2.5 0 0 1-2.5-2.5v-5l2.5-9Z" fill="#ffffff" fillOpacity="0.68" />
      {/* Floating radiant letter card inside tray */}
      <rect x="6" y="2.5" width="12" height="11" rx="2.2" fill="#fde047" />
      <path d="M8.8 6.2h6.4M8.8 9.2h4.2" stroke="#0f172a" strokeOpacity="0.65" strokeWidth="1.8" strokeLinecap="round" />
      {/* Front 3D cutout tray lip */}
      <path
        d="M2.3 13.5h5.4a1.2 1.2 0 0 1 1.1.7 3.5 3.5 0 0 0 6.4 0 1.2 1.2 0 0 1 1.1-.7h5.4v4.8A2.7 2.7 0 0 1 19 21H5a2.7 2.7 0 0 1-2.7-2.7v-4.8Z"
        fill="#ffffff"
      />
      <path d="M4.5 16.2h3M16.5 16.2h3" stroke="#0f172a" strokeOpacity="0.38" strokeWidth="1.6" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Phone Handset with Radiating Call Waves */
export function Phone3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Radiating bright gold 3D acoustic waves */}
      <path d="M14.2 5.2a4.6 4.6 0 0 1 4.5 4.5" stroke="#fde047" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M14.2 2a7.8 7.8 0 0 1 7.7 7.7" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="2.1" strokeLinecap="round" />
      {/* Main sculpted 3D handset */}
      <path
        d="M6.8 3.2c.6 0 1.2.4 1.5 1l1.3 2.7c.2.5.1 1.1-.3 1.5L7.8 9.9a11.5 11.5 0 0 0 5.6 5.6l1.5-1.5c.4-.4 1-.5 1.5-.3l2.7 1.3c.6.3 1 .9 1 1.5v1.7c0 1.3-1.1 2.4-2.4 2.3A16.2 16.2 0 0 1 2.8 4.5C2.7 3.2 3.8 2.1 5.1 2.1h1.7Z"
        fill="#ffffff"
      />
      {/* Crisp inner grip groove */}
      <path d="M5.3 5.4c.2 3.2 1.8 6.8 4.6 9.6" stroke="#0f172a" strokeOpacity="0.42" strokeWidth="1.6" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Calendar Schedule Block with Clock Badge */
export function Calendar3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Main bright calendar body */}
      <rect x="2.2" y="4.5" width="17.2" height="16" rx="3" fill="#ffffff" />
      {/* Top vibrant header bar */}
      <path d="M2.2 7.2A2.7 2.7 0 0 1 4.9 4.5h11.8a2.7 2.7 0 0 1 2.7 2.7v2.3H2.2V7.2Z" fill="#fb7185" />
      {/* 3D Binder rings */}
      <rect x="6" y="2" width="2.2" height="4.4" rx="1.1" fill="#ffffff" />
      <rect x="13.4" y="2" width="2.2" height="4.4" rx="1.1" fill="#ffffff" />
      {/* High-contrast calendar day tiles */}
      <rect x="5.2" y="11.5" width="2.8" height="2.4" rx="0.7" fill="#0f172a" fillOpacity="0.55" />
      <rect x="9.4" y="11.5" width="2.8" height="2.4" rx="0.7" fill="#0f172a" fillOpacity="0.55" />
      <rect x="5.2" y="15.2" width="2.8" height="2.4" rx="0.7" fill="#0f172a" fillOpacity="0.35" />
      {/* Floating 3D radiant clock badge */}
      <circle cx="17.5" cy="17.5" r="4.5" fill="#fde047" />
      <path d="M17.5 15.3v2.3l1.5 1" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Base3D>
  );
}

/** 3D Template Card with Pen Nib */
export function Template3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back stacked template page */}
      <rect x="5.5" y="2.2" width="14" height="17.2" rx="2.5" fill="#ffffff" fillOpacity="0.65" transform="rotate(5 12 11)" />
      {/* Main front template card */}
      <rect x="3.2" y="3.2" width="14.2" height="17.8" rx="2.6" fill="#ffffff" />
      {/* Header banner inside template */}
      <rect x="5.2" y="5.4" width="10.2" height="3.6" rx="1.1" fill="#38bdf8" />
      {/* High-contrast message lines */}
      <path d="M5.6 11.8h7.2M5.6 14.8h5" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
      {/* Floating 3D radiant stylus/pen */}
      <path d="M15 15.5 20 10.5a1.8 1.8 0 0 1 2.5 2.5l-5 5-3.3.8.8-3.3Z" fill="#fde047" />
      <path d="m15.8 15.2 4-4" stroke="#0f172a" strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Layered Customer Group Avatars */
export function Users3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Secondary back person (bright gold accent) */}
      <circle cx="16.5" cy="7.5" r="3.2" fill="#fde047" />
      <path d="M12.8 18.8c0-2.6 2.1-4.6 5-4.6 2.3 0 4.1 1.4 4.6 3.4.2.7-.3 1.2-1 1.2h-8.6Z" fill="#fde047" />
      {/* Primary front person (crisp white) */}
      <circle cx="9.2" cy="6.8" r="4" fill="#ffffff" />
      <path
        d="M2.5 19.4c0-3.5 3-5.9 6.7-5.9s6.7 2.4 6.7 5.9c0 .8-.6 1.4-1.4 1.4H3.9c-.8 0-1.4-.6-1.4-1.4Z"
        fill="#ffffff"
      />
      <path d="M6.2 16.2c1-.7 2.2-1.1 3.5-1.1" stroke="#0f172a" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Overlapping Chat Bubbles with Delivery Ticks */
export function Messages3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back speech bubble (bright gold) */}
      <path
        d="M8.5 3h10.2A3.5 3.5 0 0 1 22.2 6.5V12a3.5 3.5 0 0 1-3.5 3.5H17v2.8l-3.2-2.8H8.5A3.5 3.5 0 0 1 5 12V6.5A3.5 3.5 0 0 1 8.5 3Z"
        fill="#fde047"
      />
      {/* Front sculpted speech bubble (crisp white) */}
      <path
        d="M5.5 6.5h10.2a3.5 3.5 0 0 1 3.5 3.5v5.5a3.5 3.5 0 0 1-3.5 3.5H9.2L5.5 21.8V19A3.5 3.5 0 0 1 2 15.5V10a3.5 3.5 0 0 1 3.5-3.5Z"
        fill="#ffffff"
      />
      {/* High-contrast double check inside front bubble */}
      <path
        d="m6.2 13 2 2 4.2-4.2M10.2 13l1.5 1.5 3.8-3.8"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base3D>
  );
}

/** 3D Bevelled Gear Wheel */
export function Settings3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Outer gear teeth */}
      <path
        d="M10.2 2h3.6l.6 2.3c.7.2 1.4.5 2 .9l2.1-1.1 2.5 2.5-1.1 2.1c.4.6.7 1.3.9 2l2.3.6v3.6l-2.3.6c-.2.7-.5 1.4-.9 2l1.1 2.1-2.5 2.5-2.1-1.1c-.6.4-1.3.7-2 .9l-.6 2.3h-3.6l-.6-2.3a7.6 7.6 0 0 1-2-.9l-2.1 1.1-2.5-2.5 1.1-2.1a7.6 7.6 0 0 1-.9-2L2 13.8v-3.6l2.3-.6c.2-.7.5-1.4.9-2L4.1 5.5 6.6 3l2.1 1.1c.6-.4 1.3-.7 2-.9L10.2 2Z"
        fill="#ffffff"
      />
      {/* Inner contrasting 3D ring */}
      <circle cx="12" cy="12" r="5" fill="#f59e0b" />
      <circle cx="12" cy="12" r="2.4" fill="#0f172a" fillOpacity="0.65" />
    </Base3D>
  );
}

/** 3D Twin Business Towers */
export function Building3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Right annex tower (radiant gold) */}
      <rect x="13.5" y="8" width="7.8" height="13" rx="2" fill="#fde047" />
      <path d="M16 11.2h2.8M16 14.2h2.8M16 17.2h2.8" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      {/* Main tall front tower (crisp white) */}
      <rect x="2.8" y="2.8" width="11.8" height="18.2" rx="2.3" fill="#ffffff" />
      {/* Lit office windows */}
      <rect x="5.4" y="5.8" width="2.5" height="2.2" rx="0.6" fill="#0ea5e9" />
      <rect x="9.5" y="5.8" width="2.5" height="2.2" rx="0.6" fill="#0ea5e9" />
      <rect x="5.4" y="9.8" width="2.5" height="2.2" rx="0.6" fill="#0ea5e9" />
      <rect x="9.5" y="9.8" width="2.5" height="2.2" rx="0.6" fill="#0ea5e9" />
      {/* Entrance arch */}
      <rect x="6.8" y="15.2" width="3.8" height="5.8" rx="1.1" fill="#0f172a" fillOpacity="0.55" />
    </Base3D>
  );
}

/** 3D Sculpted Rupee Coin Stack */
export function Rupee3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back coin in stack */}
      <circle cx="14.8" cy="9.2" r="6.8" fill="#fde047" />
      {/* Front 3D coin */}
      <circle cx="10.2" cy="12.8" r="8.2" fill="#ffffff" />
      <circle cx="10.2" cy="12.8" r="6.4" stroke="#f59e0b" strokeWidth="1.4" />
      {/* High-contrast embossed ₹ symbol */}
      <path
        d="M7.6 9.2h5.2M7.6 11.5h5.2M8.2 9.2H10a2.3 2.3 0 0 1 0 4.6H8.2l3.8 3.6"
        stroke="#0f172a"
        strokeOpacity="0.8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base3D>
  );
}

/** 3D Origami Paper Plane */
export function Send3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Under-wing radiant gold fold */}
      <path d="M10.2 13.8 21.2 2.8 14.6 21.2l-4.4-7.4Z" fill="#fde047" />
      {/* Upper bright white wing */}
      <path d="M21.2 2.8 2.6 10.2l7.6 3.6 11-11Z" fill="#ffffff" />
      {/* Center crease highlight */}
      <path d="M21.2 2.8 10.2 13.8v5.2l2.8-3.2" stroke="#0f172a" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Base3D>
  );
}

/** 3D Volumetric Eye with Lens Reflection */
export function Eye3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Outer bright eye contour */}
      <path
        d="M1.8 12C3.7 7.3 7.6 4.5 12 4.5s8.3 2.8 10.2 7.5c-1.9 4.7-5.8 7.5-10.2 7.5S3.7 16.7 1.8 12Z"
        fill="#ffffff"
      />
      {/* Sculpted vibrant iris */}
      <circle cx="12" cy="12" r="4.8" fill="#7c3aed" />
      {/* Inner pupil & bright specular reflection */}
      <circle cx="12" cy="12" r="2.2" fill="#0f172a" />
      <circle cx="13.8" cy="10.2" r="1.3" fill="#fde047" />
    </Base3D>
  );
}

/** 3D Trophy Cup with Pedestal */
export function Trophy3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Side handles */}
      <path d="M6 5H3.8a1.5 1.5 0 0 0-1.5 1.5v1.2A4.2 4.2 0 0 0 6.5 11.8M18 5h2.2a1.5 1.5 0 0 1 1.5 1.5v1.2a4.2 4.2 0 0 1-4.2 4.1" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
      {/* Pedestal base */}
      <rect x="6.5" y="18.2" width="11" height="3.2" rx="1.3" fill="#ffffff" />
      <rect x="10" y="14.5" width="4" height="4.2" fill="#fde047" />
      {/* Main cup bowl */}
      <path d="M5.8 2.8h12.4v6.2a6.2 6.2 0 0 1-12.4 0V2.8Z" fill="#ffffff" />
      {/* Star / shine emblem on cup */}
      <path d="M8.6 5.5v3a3.5 3.5 0 0 0 1.6 2.8" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Speedometer Gauge */
export function Gauge3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Gauge body */}
      <path d="M2.5 17a9.8 9.8 0 1 1 19 0h-19Z" fill="#ffffff" />
      <path d="M5.6 15a6.8 6.8 0 0 1 12.8 0" stroke="#0ea5e9" strokeWidth="2.6" strokeLinecap="round" />
      {/* 3D Needle & hub */}
      <path d="m12 15.2 4.4-5.4" stroke="#f43f5e" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="2.6" fill="#0f172a" />
      <circle cx="12" cy="15.5" r="1.2" fill="#fde047" />
    </Base3D>
  );
}

/** 3D Rounded Warning Pyramid */
export function Alert3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Bright warning pyramid */}
      <path d="M13.9 3.8 21.6 17.5a2.2 2.2 0 0 1-1.9 3.3H4.3a2.2 2.2 0 0 1-1.9-3.3L10.1 3.8a2.2 2.2 0 0 1 3.8 0Z" fill="#fde047" />
      {/* High-contrast inner exclamation */}
      <path d="M12 8.8v4.8" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1.4" fill="#0f172a" />
    </Base3D>
  );
}
