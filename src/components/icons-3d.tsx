// Glyphs for the coloured icon tiles (sidebar, tab bar, KPI cubes, empty states). Like the line
// icons, a tile glyph is an empty <svg> that CSS paints, so it follows the portal's appearance
// (lib/appearance.ts) with no JavaScript:
//   Artwork "Icon set": the chosen icon set's glyph, in the tile's text colour (white).
//   "Illustrated", "Colour icons", "3D emoji": a picture file per tile (public/icons/art), only
//   downloaded when that artwork is chosen. The illustrated drawings are drawn in
//   icons-3d-classic.tsx and exported to files by scripts/icons/build.mjs.

import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type Icon3DProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & { strokeWidth?: number };

function tile(id: string, name: string) {
  const Icon = ({ className, strokeWidth, ...props }: Icon3DProps) => {
    void strokeWidth;
    return <svg aria-hidden="true" focusable="false" {...props} className={cn("pi ipt size-4 shrink-0 select-none", `pi-t-${id}`, className)} />;
  };
  Icon.displayName = name;
  return Icon;
}

export const Dashboard3D = /* @__PURE__ */ tile("dashboard", "Dashboard3D");
export const Bell3D = /* @__PURE__ */ tile("bell", "Bell3D");
export const ShoppingBag3D = /* @__PURE__ */ tile("shopping-bag", "ShoppingBag3D");
export const Store3D = /* @__PURE__ */ tile("store", "Store3D");
export const Inbox3D = /* @__PURE__ */ tile("inbox", "Inbox3D");
export const Phone3D = /* @__PURE__ */ tile("phone", "Phone3D");
export const Calendar3D = /* @__PURE__ */ tile("calendar", "Calendar3D");
export const Template3D = /* @__PURE__ */ tile("template", "Template3D");
export const Users3D = /* @__PURE__ */ tile("users", "Users3D");
export const Messages3D = /* @__PURE__ */ tile("messages", "Messages3D");
export const Settings3D = /* @__PURE__ */ tile("settings", "Settings3D");
export const Building3D = /* @__PURE__ */ tile("building", "Building3D");
export const Rupee3D = /* @__PURE__ */ tile("rupee", "Rupee3D");
export const Send3D = /* @__PURE__ */ tile("send", "Send3D");
export const Eye3D = /* @__PURE__ */ tile("eye", "Eye3D");
export const Trophy3D = /* @__PURE__ */ tile("trophy", "Trophy3D");
export const Gauge3D = /* @__PURE__ */ tile("gauge", "Gauge3D");
export const Alert3D = /* @__PURE__ */ tile("alert", "Alert3D");
export const Sparkles3D = /* @__PURE__ */ tile("sparkles", "Sparkles3D");
export const Wallet3D = /* @__PURE__ */ tile("wallet", "Wallet3D");
export const Target3D = /* @__PURE__ */ tile("target", "Target3D");
export const Clock3D = /* @__PURE__ */ tile("clock", "Clock3D");
export const ChartBar3D = /* @__PURE__ */ tile("chart-bar", "ChartBar3D");
export const MapPin3D = /* @__PURE__ */ tile("map-pin", "MapPin3D");
