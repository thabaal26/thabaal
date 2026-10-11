// Glyphs for the coloured icon tiles (sidebar, tab bar, KPI cubes, empty states). With the
// Hugeicons pack they are Hugeicons drawn in white with a soft shadow, so the tile's gradient
// carries the colour; with the Classic pack they are the original glossy 3D drawings
// (icons-3d-classic.tsx). Both render and CSS shows the client's pack (lib/icon-pack.ts).

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  Building03Icon,
  Calendar03Icon,
  Call02Icon,
  ChampionIcon,
  ChartColumnIcon,
  Clock01Icon,
  DashboardSpeed01Icon,
  DashboardSquare02Icon,
  InboxIcon,
  Location01Icon,
  MessageMultiple01Icon,
  Notification01Icon,
  RupeeCircleIcon,
  SentIcon,
  Settings02Icon,
  ShoppingBag02Icon,
  SparklesIcon,
  Store01Icon,
  Target02Icon,
  TaskEdit01Icon,
  UserGroupIcon,
  ViewIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { SVGProps } from "react";
import { cn } from "@/lib/cn";
import * as Classic from "./icons-3d-classic";

export type Icon3DProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & { strokeWidth?: number };

const SHADOW = { filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.22))" };

function tile(svg: IconSvgElement, Old: (p: Classic.Icon3DProps) => React.JSX.Element, name: string) {
  const Icon = ({ className, style, ...props }: Icon3DProps) => (
    <>
      <HugeiconsIcon
        icon={svg}
        size={24}
        strokeWidth={2}
        color="#ffffff"
        aria-hidden="true"
        focusable="false"
        {...props}
        className={cn("ip-huge size-4 shrink-0 select-none", className)}
        style={{ ...SHADOW, ...style }}
      />
      <Old {...props} style={style} className={cn("ip-classic", className)} />
    </>
  );
  Icon.displayName = name;
  return Icon;
}

export const Dashboard3D = tile(DashboardSquare02Icon, Classic.Dashboard3D, "Dashboard3D");
export const Bell3D = tile(Notification01Icon, Classic.Bell3D, "Bell3D");
export const ShoppingBag3D = tile(ShoppingBag02Icon, Classic.ShoppingBag3D, "ShoppingBag3D");
export const Store3D = tile(Store01Icon, Classic.Store3D, "Store3D");
export const Inbox3D = tile(InboxIcon, Classic.Inbox3D, "Inbox3D");
export const Phone3D = tile(Call02Icon, Classic.Phone3D, "Phone3D");
export const Calendar3D = tile(Calendar03Icon, Classic.Calendar3D, "Calendar3D");
export const Template3D = tile(TaskEdit01Icon, Classic.Template3D, "Template3D");
export const Users3D = tile(UserGroupIcon, Classic.Users3D, "Users3D");
export const Messages3D = tile(MessageMultiple01Icon, Classic.Messages3D, "Messages3D");
export const Settings3D = tile(Settings02Icon, Classic.Settings3D, "Settings3D");
export const Building3D = tile(Building03Icon, Classic.Building3D, "Building3D");
export const Rupee3D = tile(RupeeCircleIcon, Classic.Rupee3D, "Rupee3D");
export const Send3D = tile(SentIcon, Classic.Send3D, "Send3D");
export const Eye3D = tile(ViewIcon, Classic.Eye3D, "Eye3D");
export const Trophy3D = tile(ChampionIcon, Classic.Trophy3D, "Trophy3D");
export const Gauge3D = tile(DashboardSpeed01Icon, Classic.Gauge3D, "Gauge3D");
export const Alert3D = tile(Alert02Icon, Classic.Alert3D, "Alert3D");
export const Sparkles3D = tile(SparklesIcon, Classic.Sparkles3D, "Sparkles3D");
export const Wallet3D = tile(Wallet01Icon, Classic.Wallet3D, "Wallet3D");
export const Target3D = tile(Target02Icon, Classic.Target3D, "Target3D");
export const Clock3D = tile(Clock01Icon, Classic.Clock3D, "Clock3D");
export const ChartBar3D = tile(ChartColumnIcon, Classic.ChartBar3D, "ChartBar3D");
export const MapPin3D = tile(Location01Icon, Classic.MapPin3D, "MapPin3D");
