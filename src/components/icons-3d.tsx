// Glyphs for the coloured icon tiles (sidebar, tab bar, KPI cubes, empty states). Each tile glyph
// ships in three variants and CSS shows the one for the client's icon set and look
// (lib/icon-pack.ts):
//   Hugeicons (3D or 2D): a white Hugeicons glyph; the tile's gradient carries the colour.
//   Lucide + 3D: the original glossy drawings (icons-3d-classic.tsx).
//   Lucide + 2D: a white Lucide line icon.

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
import {
  Bell as LBell,
  Building2 as LBuilding2,
  CalendarDays as LCalendarDays,
  ChartColumn as LChartColumn,
  Clock as LClock,
  Eye as LEye,
  Gauge as LGauge,
  IndianRupee as LIndianRupee,
  Inbox as LInbox,
  LayoutDashboard as LLayoutDashboard,
  MapPin as LMapPin,
  MessagesSquare as LMessagesSquare,
  NotebookPen as LNotebookPen,
  Phone as LPhone,
  Send as LSend,
  Settings as LSettings,
  ShoppingBag as LShoppingBag,
  Sparkles as LSparkles,
  Store as LStore,
  Target as LTarget,
  TriangleAlert as LTriangleAlert,
  Trophy as LTrophy,
  Users as LUsers,
  Wallet as LWallet,
  type LucideIcon,
} from "lucide-react";

export type Icon3DProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & { strokeWidth?: number };

const SHADOW = { filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.22))" };

function tile(svg: IconSvgElement, Old: (p: Classic.Icon3DProps) => React.JSX.Element, Flat: LucideIcon, name: string) {
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
        className={cn("ipt-huge size-4 shrink-0 select-none", className)}
        style={{ ...SHADOW, ...style }}
      />
      <Old {...props} style={style} className={cn("ipt-drawn", className)} />
      <Flat {...props} style={style} color="#ffffff" strokeWidth={2.1} aria-hidden="true" focusable="false" className={cn("ipt-lucide size-4 shrink-0 select-none", className)} />
    </>
  );
  Icon.displayName = name;
  return Icon;
}

export const Dashboard3D = tile(DashboardSquare02Icon, Classic.Dashboard3D, LLayoutDashboard, "Dashboard3D");
export const Bell3D = tile(Notification01Icon, Classic.Bell3D, LBell, "Bell3D");
export const ShoppingBag3D = tile(ShoppingBag02Icon, Classic.ShoppingBag3D, LShoppingBag, "ShoppingBag3D");
export const Store3D = tile(Store01Icon, Classic.Store3D, LStore, "Store3D");
export const Inbox3D = tile(InboxIcon, Classic.Inbox3D, LInbox, "Inbox3D");
export const Phone3D = tile(Call02Icon, Classic.Phone3D, LPhone, "Phone3D");
export const Calendar3D = tile(Calendar03Icon, Classic.Calendar3D, LCalendarDays, "Calendar3D");
export const Template3D = tile(TaskEdit01Icon, Classic.Template3D, LNotebookPen, "Template3D");
export const Users3D = tile(UserGroupIcon, Classic.Users3D, LUsers, "Users3D");
export const Messages3D = tile(MessageMultiple01Icon, Classic.Messages3D, LMessagesSquare, "Messages3D");
export const Settings3D = tile(Settings02Icon, Classic.Settings3D, LSettings, "Settings3D");
export const Building3D = tile(Building03Icon, Classic.Building3D, LBuilding2, "Building3D");
export const Rupee3D = tile(RupeeCircleIcon, Classic.Rupee3D, LIndianRupee, "Rupee3D");
export const Send3D = tile(SentIcon, Classic.Send3D, LSend, "Send3D");
export const Eye3D = tile(ViewIcon, Classic.Eye3D, LEye, "Eye3D");
export const Trophy3D = tile(ChampionIcon, Classic.Trophy3D, LTrophy, "Trophy3D");
export const Gauge3D = tile(DashboardSpeed01Icon, Classic.Gauge3D, LGauge, "Gauge3D");
export const Alert3D = tile(Alert02Icon, Classic.Alert3D, LTriangleAlert, "Alert3D");
export const Sparkles3D = tile(SparklesIcon, Classic.Sparkles3D, LSparkles, "Sparkles3D");
export const Wallet3D = tile(Wallet01Icon, Classic.Wallet3D, LWallet, "Wallet3D");
export const Target3D = tile(Target02Icon, Classic.Target3D, LTarget, "Target3D");
export const Clock3D = tile(Clock01Icon, Classic.Clock3D, LClock, "Clock3D");
export const ChartBar3D = tile(ChartColumnIcon, Classic.ChartBar3D, LChartColumn, "ChartBar3D");
export const MapPin3D = tile(Location01Icon, Classic.MapPin3D, LMapPin, "MapPin3D");
