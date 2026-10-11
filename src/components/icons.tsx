// The portal's icon set: Hugeicons (free, MIT), stroke-rounded style.
// Every screen imports icons from here, never from the icon package directly, so the look,
// the default stroke and accessibility stay the same everywhere. To add one, pick it at
// https://hugeicons.com/icons (free set), import it below and export it under a short name.

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowDownRight01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUpRight01Icon,
  BankIcon,
  BookOpen01Icon,
  Building03Icon,
  Calendar01Icon,
  Calendar03Icon,
  Calendar04Icon,
  CalendarClockIcon,
  Call02Icon,
  CallEnd01Icon,
  CallIcon,
  CallIncoming01Icon,
  CallMissed01Icon,
  CallOutgoing01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  CloudIcon,
  CloudOffIcon,
  ComputerIcon,
  Copy01Icon,
  CreditCardIcon,
  DashboardSpeed01Icon,
  Delete02Icon,
  DeliveryTruck01Icon,
  Download04Icon,
  Edit02Icon,
  File02Icon,
  FileImportIcon,
  FilterHorizontalIcon,
  FlashIcon,
  GlobalIcon,
  GoogleSheetIcon,
  HelpCircleIcon,
  HistoryIcon,
  HourglassIcon,
  Idea01Icon,
  Image01Icon,
  ImageAdd01Icon,
  ImageNotFound01Icon,
  InboxIcon,
  InformationCircleIcon,
  Invoice03Icon,
  Key01Icon,
  Link01Icon,
  LinkSquare02Icon,
  LiveStreaming02Icon,
  Loading03Icon,
  Location01Icon,
  Logout03Icon,
  MailReply01Icon,
  Megaphone01Icon,
  Menu01Icon,
  Message01Icon,
  Message02Icon,
  Mic01Icon,
  MicOff01Icon,
  Money03Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  Notification03Icon,
  Package03Icon,
  PackageDeliveredIcon,
  PackageOpenIcon,
  PauseCircleIcon,
  PauseIcon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  PlayIcon,
  PrinterIcon,
  QrCodeIcon,
  QuoteDownSquareIcon,
  Refresh01Icon,
  RefreshIcon,
  RepeatIcon,
  Search01Icon,
  SecurityCheckIcon,
  SecurityWarningIcon,
  SentIcon,
  ShoppingBag02Icon,
  ShoppingCart01Icon,
  SmartPhone01Icon,
  SnailIcon,
  SourceCodeIcon,
  SparklesIcon,
  Store01Icon,
  Sun03Icon,
  Tag01Icon,
  TestTube01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  Tick02Icon,
  TickDouble02Icon,
  UnavailableIcon,
  Undo02Icon,
  UndoIcon,
  Upload04Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserIcon,
  UserMultiple02Icon,
  UserRemove01Icon,
  ViewIcon,
  ViewOffSlashIcon,
  Wallet01Icon,
  Xls02Icon,
} from "@hugeicons/core-free-icons";
import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children"> & {
  /** Pixel size; usually left alone and set with a Tailwind size-* class instead. */
  size?: number | string;
  strokeWidth?: number;
};
export type IconComponent = ((props: IconProps) => React.JSX.Element) & { displayName?: string };

/** Slightly heavier than the 1.5 Hugeicons draws at, so 16px icons stay crisp next to text. */
const STROKE = 1.75;

function icon(svg: IconSvgElement, name: string): IconComponent {
  const Icon = ({ size = 24, strokeWidth = STROKE, ...rest }: IconProps) => (
    <HugeiconsIcon
      icon={svg}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={rest["aria-label"] || rest.role ? undefined : true}
      focusable="false"
      {...rest}
    />
  );
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = icon(AlertCircleIcon, "AlertCircle");
export const AlertTriangle = icon(Alert02Icon, "AlertTriangle");
export const ArrowDownRight = icon(ArrowDownRight01Icon, "ArrowDownRight");
export const ArrowLeft = icon(ArrowLeft02Icon, "ArrowLeft");
export const ArrowRight = icon(ArrowRight02Icon, "ArrowRight");
export const ArrowUpRight = icon(ArrowUpRight01Icon, "ArrowUpRight");
export const Ban = icon(UnavailableIcon, "Ban");
export const Banknote = icon(Money03Icon, "Banknote");
export const Bell = icon(Notification01Icon, "Bell");
export const BellRing = icon(Notification03Icon, "BellRing");
export const Bold = icon(TextBoldIcon, "Bold");
export const BookOpen = icon(BookOpen01Icon, "BookOpen");
export const Braces = icon(SourceCodeIcon, "Braces");
export const Building2 = icon(Building03Icon, "Building2");
export const Calendar = icon(Calendar01Icon, "Calendar");
export const CalendarClock = icon(CalendarClockIcon, "CalendarClock");
export const CalendarDays = icon(Calendar03Icon, "CalendarDays");
export const CalendarRange = icon(Calendar04Icon, "CalendarRange");
export const Check = icon(Tick02Icon, "Check");
export const CheckCheck = icon(TickDouble02Icon, "CheckCheck");
export const CheckCircle2 = icon(CheckmarkCircle02Icon, "CheckCircle2");
export const ChevronDown = icon(ArrowDown01Icon, "ChevronDown");
export const ChevronLeft = icon(ArrowLeft01Icon, "ChevronLeft");
export const ChevronRight = icon(ArrowRight01Icon, "ChevronRight");
export const ChevronUp = icon(ArrowUp01Icon, "ChevronUp");
export const Circle = icon(CircleIcon, "Circle");
export const CircleAlert = icon(AlertCircleIcon, "CircleAlert");
export const CircleCheck = icon(CheckmarkCircle02Icon, "CircleCheck");
export const Clock = icon(Clock01Icon, "Clock");
export const Cloud = icon(CloudIcon, "Cloud");
export const CloudOff = icon(CloudOffIcon, "CloudOff");
export const Copy = icon(Copy01Icon, "Copy");
export const CreditCard = icon(CreditCardIcon, "CreditCard");
export const Download = icon(Download04Icon, "Download");
export const ExternalLink = icon(LinkSquare02Icon, "ExternalLink");
export const Eye = icon(ViewIcon, "Eye");
export const EyeOff = icon(ViewOffSlashIcon, "EyeOff");
export const FileSpreadsheet = icon(Xls02Icon, "FileSpreadsheet");
export const FileText = icon(File02Icon, "FileText");
export const FileUp = icon(FileImportIcon, "FileUp");
export const FlaskConical = icon(TestTube01Icon, "FlaskConical");
export const Gauge = icon(DashboardSpeed01Icon, "Gauge");
export const Globe = icon(GlobalIcon, "Globe");
export const HelpCircle = icon(HelpCircleIcon, "HelpCircle");
export const History = icon(HistoryIcon, "History");
export const Hourglass = icon(HourglassIcon, "Hourglass");
export const Image = icon(Image01Icon, "Image");
export const ImageIcon = Image;
export const ImageOff = icon(ImageNotFound01Icon, "ImageOff");
export const ImagePlus = icon(ImageAdd01Icon, "ImagePlus");
export const Inbox = icon(InboxIcon, "Inbox");
export const Info = icon(InformationCircleIcon, "Info");
export const Italic = icon(TextItalicIcon, "Italic");
export const KeyRound = icon(Key01Icon, "KeyRound");
export const Landmark = icon(BankIcon, "Landmark");
export const Lightbulb = icon(Idea01Icon, "Lightbulb");
export const Link = icon(Link01Icon, "Link");
export const Loader2 = icon(Loading03Icon, "Loader2");
export const LogOut = icon(Logout03Icon, "LogOut");
export const MapPin = icon(Location01Icon, "MapPin");
export const Megaphone = icon(Megaphone01Icon, "Megaphone");
export const Menu = icon(Menu01Icon, "Menu");
export const MessageCircle = icon(Message01Icon, "MessageCircle");
export const MessageSquareQuote = icon(QuoteDownSquareIcon, "MessageSquareQuote");
export const MessageSquareText = icon(Message02Icon, "MessageSquareText");
export const Mic = icon(Mic01Icon, "Mic");
export const MicOff = icon(MicOff01Icon, "MicOff");
export const Monitor = icon(ComputerIcon, "Monitor");
export const Moon = icon(Moon02Icon, "Moon");
export const MoreHorizontal = icon(MoreHorizontalIcon, "MoreHorizontal");
export const Package = icon(Package03Icon, "Package");
export const PackageCheck = icon(PackageDeliveredIcon, "PackageCheck");
export const PackageOpen = icon(PackageOpenIcon, "PackageOpen");
export const Pause = icon(PauseIcon, "Pause");
export const PauseCircle = icon(PauseCircleIcon, "PauseCircle");
export const Pencil = icon(PencilEdit01Icon, "Pencil");
export const PencilLine = icon(PencilEdit02Icon, "PencilLine");
export const Phone = icon(Call02Icon, "Phone");
export const PhoneCall = icon(CallIcon, "PhoneCall");
export const PhoneIncoming = icon(CallIncoming01Icon, "PhoneIncoming");
export const PhoneMissed = icon(CallMissed01Icon, "PhoneMissed");
export const PhoneOff = icon(CallEnd01Icon, "PhoneOff");
export const PhoneOutgoing = icon(CallOutgoing01Icon, "PhoneOutgoing");
export const Play = icon(PlayIcon, "Play");
export const Plus = icon(Add01Icon, "Plus");
export const Printer = icon(PrinterIcon, "Printer");
export const QrCode = icon(QrCodeIcon, "QrCode");
export const Radio = icon(LiveStreaming02Icon, "Radio");
export const ReceiptText = icon(Invoice03Icon, "ReceiptText");
export const RefreshCw = icon(RefreshIcon, "RefreshCw");
export const Repeat = icon(RepeatIcon, "Repeat");
export const Reply = icon(MailReply01Icon, "Reply");
export const RotateCcw = icon(UndoIcon, "RotateCcw");
export const RotateCw = icon(Refresh01Icon, "RotateCw");
export const Search = icon(Search01Icon, "Search");
export const Send = icon(SentIcon, "Send");
export const Sheet = icon(GoogleSheetIcon, "Sheet");
export const ShieldAlert = icon(SecurityWarningIcon, "ShieldAlert");
export const ShieldCheck = icon(SecurityCheckIcon, "ShieldCheck");
export const ShoppingBag = icon(ShoppingBag02Icon, "ShoppingBag");
export const ShoppingCart = icon(ShoppingCart01Icon, "ShoppingCart");
export const SlidersHorizontal = icon(FilterHorizontalIcon, "SlidersHorizontal");
export const Smartphone = icon(SmartPhone01Icon, "Smartphone");
export const Snail = icon(SnailIcon, "Snail");
export const Sparkles = icon(SparklesIcon, "Sparkles");
export const SquarePen = icon(Edit02Icon, "SquarePen");
export const Store = icon(Store01Icon, "Store");
export const Strikethrough = icon(TextStrikethroughIcon, "Strikethrough");
export const Sun = icon(Sun03Icon, "Sun");
export const Tags = icon(Tag01Icon, "Tags");
export const Trash2 = icon(Delete02Icon, "Trash2");
export const TriangleAlert = icon(Alert02Icon, "TriangleAlert");
export const Truck = icon(DeliveryTruck01Icon, "Truck");
export const Undo2 = icon(Undo02Icon, "Undo2");
export const Upload = icon(Upload04Icon, "Upload");
export const User = icon(UserIcon, "User");
export const UserCheck = icon(UserCheck01Icon, "UserCheck");
export const UserPlus = icon(UserAdd01Icon, "UserPlus");
export const UserRound = icon(UserCircleIcon, "UserRound");
export const UserX = icon(UserRemove01Icon, "UserX");
export const Users = icon(UserMultiple02Icon, "Users");
export const UsersRound = icon(UserGroupIcon, "UsersRound");
export const Wallet = icon(Wallet01Icon, "Wallet");
export const X = icon(Cancel01Icon, "X");
export const XCircle = icon(CancelCircleIcon, "XCircle");
export const Zap = icon(FlashIcon, "Zap");
