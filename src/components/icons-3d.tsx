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

/** 3D Layered Bento Dashboard Icon */
export function Dashboard3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back depth shadow layer */}
      <rect x="2.5" y="3.5" width="8.5" height="9.5" rx="2.5" fill="currentColor" fillOpacity="0.28" />
      <rect x="13" y="11.5" width="8.5" height="9.5" rx="2.5" fill="currentColor" fillOpacity="0.28" />
      {/* Main sculpted front tiles */}
      <rect x="2.5" y="2.5" width="8.5" height="9.5" rx="2.5" fill="currentColor" fillOpacity="0.92" />
      <path d="M4.5 4h4.5a1 1 0 0 1 0 2H4.5a1 1 0 0 1 0-2Z" fill="#fff" fillOpacity="0.45" />
      {/* Floating top-right 3D stat cube */}
      <rect x="13" y="2.5" width="8.5" height="6.5" rx="2.2" fill="currentColor" fillOpacity="0.6" />
      <rect x="13" y="2" width="8.5" height="6" rx="2.2" fill="currentColor" />
      <circle cx="19" cy="4.5" r="1.1" fill="#fff" fillOpacity="0.6" />
      {/* Bottom-left mini tile */}
      <rect x="2.5" y="14" width="8.5" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.68" />
      {/* Bottom-right tall chart tile */}
      <rect x="13" y="10.5" width="8.5" height="11" rx="2.5" fill="currentColor" fillOpacity="0.92" />
      <rect x="15.2" y="16" width="1.4" height="3.5" rx="0.7" fill="#fff" fillOpacity="0.5" />
      <rect x="17.8" y="13.5" width="1.4" height="6" rx="0.7" fill="#fff" fillOpacity="0.75" />
    </Base3D>
  );
}

/** 3D Sculpted Notification Bell with Glowing Badge */
export function Bell3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Clapper base */}
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0h-5Z" fill="currentColor" fillOpacity="0.5" />
      {/* Back rim shadow */}
      <rect x="3.5" y="16.2" width="17" height="2.6" rx="1.3" fill="currentColor" fillOpacity="0.35" />
      {/* Main bell dome */}
      <path
        d="M12 3a6 6 0 0 0-6 6v3.8c0 .9-.36 1.76-1 2.4L4.2 16h15.6l-.8-.8a3.4 3.4 0 0 1-1-2.4V9a6 6 0 0 0-6-6Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
      {/* Specular highlight curve on dome */}
      <path
        d="M8.5 8.5A3.8 3.8 0 0 1 12 5.2"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Front bevelled base plate */}
      <rect x="3.5" y="15.2" width="17" height="2.6" rx="1.3" fill="currentColor" />
      {/* Floating 3D notification orb */}
      <circle cx="17.8" cy="5.5" r="2.8" fill="currentColor" />
      <circle cx="17.8" cy="5.5" r="1.6" fill="#fff" fillOpacity="0.85" />
    </Base3D>
  );
}

/** 3D Shopping Bag with Gusset Depth & Handles */
export function ShoppingBag3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back bag fold */}
      <path d="M5.5 7.5h13l1.2 12a2.5 2.5 0 0 1-2.5 2.7H6.8a2.5 2.5 0 0 1-2.5-2.7l1.2-12Z" fill="currentColor" fillOpacity="0.32" />
      {/* Back handle */}
      <path d="M9 7.5V5.8a3 3 0 0 1 6 0v1.7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      {/* Main front bag body */}
      <path d="M4.8 7h14.4l1.1 11.5A2.5 2.5 0 0 1 17.8 21H6.2a2.5 2.5 0 0 1-2.5-2.5L4.8 7Z" fill="currentColor" fillOpacity="0.93" />
      {/* Top glossy lip */}
      <path d="M4.8 7h14.4l.2 2H4.6l.2-2Z" fill="#fff" fillOpacity="0.28" />
      {/* Front 3D rope handle */}
      <path d="M8.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.9" strokeLinecap="round" />
      {/* Handle grommets */}
      <circle cx="8.5" cy="9" r="1" fill="#fff" fillOpacity="0.65" />
      <circle cx="15.5" cy="9" r="1" fill="#fff" fillOpacity="0.65" />
      {/* Price tag emblem */}
      <rect x="13" y="13.5" width="4.5" height="3" rx="0.9" fill="#fff" fillOpacity="0.45" />
    </Base3D>
  );
}

/** 3D Storefront / Catalogue Awning Icon */
export function Store3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Shop base building */}
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" fill="currentColor" fillOpacity="0.45" />
      {/* Shop window & door */}
      <rect x="6.5" y="13" width="5" height="5" rx="1" fill="#fff" fillOpacity="0.65" />
      <rect x="13.5" y="13" width="4" height="8" rx="1" fill="currentColor" fillOpacity="0.95" />
      {/* 3D Awning roof */}
      <path d="M4.2 3.5h15.6l1.7 5.2H2.5l1.7-5.2Z" fill="currentColor" fillOpacity="0.95" />
      {/* Awning stripes */}
      <path d="M8.5 3.5 7.5 8.7M12 3.5v5.2M15.5 3.5l1 5.2" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* Scalloped 3D awning valance */}
      <path d="M2.5 8.7a2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.7 0 2.4 2.4 0 0 0 4.7 0 2.4 2.4 0 0 0 4.8 0H2.5Z" fill="currentColor" />
    </Base3D>
  );
}

/** 3D Inbox Tray with Incoming Message Card */
export function Inbox3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back tray wall */}
      <path d="M5 4.5h14l2.5 9v5A2.5 2.5 0 0 1 19 21H5a2.5 2.5 0 0 1-2.5-2.5v-5l2.5-9Z" fill="currentColor" fillOpacity="0.35" />
      {/* Floating letter card inside tray */}
      <rect x="6.5" y="3" width="11" height="10" rx="2" fill="currentColor" fillOpacity="0.85" />
      <path d="M9 6.5h6M9 9.2h4" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
      {/* Front 3D cutout tray lip */}
      <path
        d="M2.5 13.5h5.2a1.2 1.2 0 0 1 1.1.7 3.5 3.5 0 0 0 6.4 0 1.2 1.2 0 0 1 1.1-.7h5.2v4.8A2.7 2.7 0 0 1 18.8 21H5.2a2.7 2.7 0 0 1-2.7-2.7v-4.8Z"
        fill="currentColor"
      />
      <path d="M4 15h3.2M16.8 15H20" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.4" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Phone Handset with Radiating Call Waves */
export function Phone3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Radiating 3D acoustic waves */}
      <path d="M14.5 5.2a4.5 4.5 0 0 1 4.3 4.3" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 2.2a7.5 7.5 0 0 1 7.3 7.3" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
      {/* Back depth shadow of handset */}
      <path
        d="M6.8 4.2c.6 0 1.2.4 1.5 1l1.2 2.6c.2.5.1 1.1-.3 1.5L7.8 10.7a11.5 11.5 0 0 0 5.5 5.5l1.4-1.4c.4-.4 1-.5 1.5-.3l2.6 1.2c.6.3 1 .9 1 1.5v1.6c0 1.3-1.1 2.3-2.4 2.2A16 16 0 0 1 3 5.4C2.9 4.1 3.9 3 5.2 3h1.6Z"
        fill="currentColor"
        fillOpacity="0.32"
        transform="translate(0.5 0.8)"
      />
      {/* Main sculpted 3D handset */}
      <path
        d="M6.8 3.5c.6 0 1.2.4 1.5 1l1.2 2.6c.2.5.1 1.1-.3 1.5L7.8 10a11.5 11.5 0 0 0 5.5 5.5l1.4-1.4c.4-.4 1-.5 1.5-.3l2.6 1.2c.6.3 1 .9 1 1.5v1.6c0 1.3-1.1 2.3-2.4 2.2A16 16 0 0 1 3 4.7C2.9 3.4 3.9 2.3 5.2 2.3h1.6Z"
        fill="currentColor"
      />
      {/* Specular highlight along handset ridge */}
      <path d="M5.2 5.2c.2 3.2 1.8 6.8 4.6 9.6" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Calendar Schedule Block with Clock Badge */
export function Calendar3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Calendar body */}
      <rect x="2.5" y="4.5" width="17" height="16" rx="3" fill="currentColor" fillOpacity="0.38" />
      <rect x="2.5" y="8.5" width="17" height="11.5" rx="2.5" fill="currentColor" fillOpacity="0.88" />
      {/* Top header bar */}
      <path d="M2.5 7A2.5 2.5 0 0 1 5 4.5h12A2.5 2.5 0 0 1 19.5 7v2h-17V7Z" fill="currentColor" />
      {/* 3D Binder rings */}
      <rect x="6.2" y="2.2" width="2" height="4.2" rx="1" fill="#fff" fillOpacity="0.85" />
      <rect x="13.8" y="2.2" width="2" height="4.2" rx="1" fill="#fff" fillOpacity="0.85" />
      {/* Calendar day dots */}
      <rect x="5.5" y="11.5" width="2.5" height="2.2" rx="0.6" fill="#fff" fillOpacity="0.65" />
      <rect x="9.5" y="11.5" width="2.5" height="2.2" rx="0.6" fill="#fff" fillOpacity="0.65" />
      <rect x="5.5" y="15" width="2.5" height="2.2" rx="0.6" fill="#fff" fillOpacity="0.45" />
      {/* Floating 3D clock badge */}
      <circle cx="17.5" cy="17.5" r="4.2" fill="currentColor" />
      <circle cx="17.5" cy="17.5" r="3" fill="#fff" fillOpacity="0.9" />
      <path d="M17.5 16v1.7l1.2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base3D>
  );
}

/** 3D Template Card with Pen Nib */
export function Template3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back stacked template page */}
      <rect x="5.5" y="2.5" width="14" height="17" rx="2.5" fill="currentColor" fillOpacity="0.3" transform="rotate(4 12 11)" />
      {/* Main front template card */}
      <rect x="3.5" y="3.5" width="14" height="17.5" rx="2.5" fill="currentColor" fillOpacity="0.92" />
      {/* Header banner inside template */}
      <rect x="5.5" y="5.5" width="10" height="3.5" rx="1" fill="#fff" fillOpacity="0.45" />
      {/* Message lines */}
      <path d="M6 11.5h7M6 14.2h5" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
      {/* Floating 3D stylus/pen */}
      <path d="M15.5 15.5 20.2 10.8a1.6 1.6 0 0 1 2.3 2.3L17.8 17.8l-3 .7.7-3Z" fill="currentColor" />
      <path d="m16.2 15.2 3.8-3.8" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.4" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Layered Customer Group Avatars */
export function Users3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Secondary back person */}
      <circle cx="16.5" cy="7.5" r="3" fill="currentColor" fillOpacity="0.45" />
      <path d="M13 18.5c0-2.5 2-4.5 4.8-4.5 2.2 0 4 1.3 4.5 3.3.2.7-.3 1.2-1 1.2H13Z" fill="currentColor" fillOpacity="0.45" />
      {/* Primary front person */}
      <circle cx="9.5" cy="7" r="3.8" fill="currentColor" />
      <path d="M8.2 5.2a2 2 0 0 1 2.2-.4" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M3 19.2c0-3.3 2.9-5.7 6.5-5.7s6.5 2.4 6.5 5.7c0 .8-.6 1.3-1.4 1.3H4.4c-.8 0-1.4-.5-1.4-1.3Z"
        fill="currentColor"
        fillOpacity="0.95"
      />
      <path d="M5.5 16c1.1-.8 2.5-1.2 4-1.2" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Overlapping Chat Bubbles with Delivery Ticks */
export function Messages3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back speech bubble */}
      <path
        d="M8.5 3.5h10A3.5 3.5 0 0 1 22 7v5.5a3.5 3.5 0 0 1-3.5 3.5H17v2.8l-3.2-2.8H8.5A3.5 3.5 0 0 1 5 12.5V7a3.5 3.5 0 0 1 3.5-3.5Z"
        fill="currentColor"
        fillOpacity="0.38"
      />
      {/* Front sculpted speech bubble */}
      <path
        d="M5.5 6.5h10A3.5 3.5 0 0 1 19 10v5.5a3.5 3.5 0 0 1-3.5 3.5H9.2L5.5 21.8V19A3.5 3.5 0 0 1 2 15.5V10a3.5 3.5 0 0 1 3.5-3.5Z"
        fill="currentColor"
      />
      {/* Glossy double check inside front bubble */}
      <path d="m6.5 13 2 2 4.2-4.2M10.5 13l1.5 1.5 3.8-3.8" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Base3D>
  );
}

/** 3D Bevelled Gear Wheel */
export function Settings3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Outer gear teeth */}
      <path
        d="M10.3 2.3h3.4l.6 2.2a7.5 7.5 0 0 1 2 .8l2-1.1 2.4 2.4-1.1 2c.4.6.6 1.3.8 2l2.2.6v3.4l-2.2.6a7.5 7.5 0 0 1-.8 2l1.1 2-2.4 2.4-2-1.1c-.6.4-1.3.6-2 .8l-.6 2.2h-3.4l-.6-2.2a7.5 7.5 0 0 1-2-.8l-2 1.1-2.4-2.4 1.1-2a7.5 7.5 0 0 1-.8-2l-2.2-.6v-3.4l2.2-.6c.2-.7.4-1.4.8-2l-1.1-2 2.4-2.4 2 1.1c.6-.4 1.3-.6 2-.8l.6-2.2Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
      {/* Inner recessed 3D ring */}
      <circle cx="12" cy="12" r="5" fill="#fff" fillOpacity="0.28" />
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
      <circle cx="11.2" cy="11.2" r="1" fill="#fff" fillOpacity="0.65" />
    </Base3D>
  );
}

/** 3D Twin Business Towers */
export function Building3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Right annex tower */}
      <rect x="13.5" y="8.5" width="7.5" height="12.5" rx="1.8" fill="currentColor" fillOpacity="0.45" />
      <path d="M16 11.5h2.5M16 14.5h2.5M16 17.5h2.5" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
      {/* Main tall front tower */}
      <rect x="3" y="3" width="11.5" height="18" rx="2.2" fill="currentColor" />
      {/* Lit office windows */}
      <rect x="5.5" y="6" width="2.4" height="2" rx="0.5" fill="#fff" fillOpacity="0.75" />
      <rect x="9.6" y="6" width="2.4" height="2" rx="0.5" fill="#fff" fillOpacity="0.75" />
      <rect x="5.5" y="10" width="2.4" height="2" rx="0.5" fill="#fff" fillOpacity="0.75" />
      <rect x="9.6" y="10" width="2.4" height="2" rx="0.5" fill="#fff" fillOpacity="0.5" />
      {/* Entrance arch */}
      <rect x="7" y="15.5" width="3.5" height="5.5" rx="1" fill="#fff" fillOpacity="0.65" />
    </Base3D>
  );
}

/** 3D Sculpted Rupee Coin Stack */
export function Rupee3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back coin in stack */}
      <circle cx="14.5" cy="9.5" r="6.5" fill="currentColor" fillOpacity="0.35" />
      {/* Front 3D coin */}
      <circle cx="10.5" cy="12.5" r="8" fill="currentColor" />
      <circle cx="10.5" cy="12.5" r="6.3" stroke="#fff" strokeOpacity="0.38" strokeWidth="1.2" />
      {/* Embossed ₹ symbol */}
      <path
        d="M8 9h5M8 11.3h5M8.5 9h1.8a2.3 2.3 0 0 1 0 4.6H8.5l3.8 3.6"
        stroke="#fff"
        strokeWidth="1.8"
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
      {/* Under-wing shadow fold */}
      <path d="M10.2 13.8 21 3 14.5 21l-4.3-7.2Z" fill="currentColor" fillOpacity="0.5" />
      {/* Upper bright wing */}
      <path d="M21 3 3 10.2l7.2 3.6L21 3Z" fill="currentColor" />
      {/* Center crease highlight */}
      <path d="M21 3 10.2 13.8v5.2l2.6-3.1" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Base3D>
  );
}

/** 3D Volumetric Eye with Lens Reflection */
export function Eye3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Outer eye contour */}
      <path
        d="M2.2 12c1.8-4.4 5.6-7.2 9.8-7.2s8 2.8 9.8 7.2c-1.8 4.4-5.6 7.2-9.8 7.2S4 16.4 2.2 12Z"
        fill="currentColor"
        fillOpacity="0.38"
      />
      {/* Sculpted iris */}
      <circle cx="12" cy="12" r="4.6" fill="currentColor" />
      {/* Inner pupil & specular reflection */}
      <circle cx="12" cy="12" r="2.1" fill="#fff" fillOpacity="0.85" />
      <circle cx="13.8" cy="10.2" r="1" fill="#fff" />
    </Base3D>
  );
}

/** 3D Trophy Cup with Pedestal */
export function Trophy3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Side handles */}
      <path d="M6 5H4a1.5 1.5 0 0 0-1.5 1.5v1A4 4 0 0 0 6.5 11.5M18 5h2a1.5 1.5 0 0 1 1.5 1.5v1a4 4 0 0 1-4 4" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      {/* Pedestal base */}
      <rect x="7" y="18.5" width="10" height="3" rx="1.2" fill="currentColor" />
      <rect x="10.2" y="14.5" width="3.6" height="4.5" fill="currentColor" fillOpacity="0.6" />
      {/* Main cup bowl */}
      <path d="M6 3h12v6a6 6 0 0 1-12 0V3Z" fill="currentColor" />
      {/* Specular shine on cup */}
      <path d="M8.5 5.5v3a3.5 3.5 0 0 0 1.5 2.8" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.6" strokeLinecap="round" />
    </Base3D>
  );
}

/** 3D Speedometer Gauge */
export function Gauge3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Gauge body */}
      <path d="M3.2 16.5a9.5 9.5 0 1 1 17.6 0H3.2Z" fill="currentColor" fillOpacity="0.32" />
      <path d="M5.5 15a7 7 0 0 1 13 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      {/* 3D Needle & hub */}
      <path d="m12 15 4.2-5.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="2.6" fill="currentColor" />
      <circle cx="12" cy="15.5" r="1.2" fill="#fff" />
    </Base3D>
  );
}

/** 3D Rounded Warning Pyramid */
export function Alert3D(props: Icon3DProps) {
  return (
    <Base3D {...props}>
      {/* Back pyramid shadow */}
      <path d="M13.9 4.2 21.4 17.5a2.2 2.2 0 0 1-1.9 3.3H4.5a2.2 2.2 0 0 1-1.9-3.3L10.1 4.2a2.2 2.2 0 0 1 3.8 0Z" fill="currentColor" />
      {/* Inner exclamation */}
      <path d="M12 9v4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="1.3" fill="#fff" />
    </Base3D>
  );
}
