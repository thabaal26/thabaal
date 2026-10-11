// The portal's icon set. Every screen imports icons from here, never from an icon package
// directly, so the look, the default stroke and accessibility stay the same everywhere.
//
// Two packs ship side by side and each client's portal shows the one picked for it on the
// admin Clients page (lib/icon-pack.ts): Hugeicons (default, free MIT set) and Classic
// (Lucide, ISC). Each icon draws both; CSS hides the pack that isn't chosen.
// To add an icon: pick it at https://hugeicons.com/icons (free set) and https://lucide.dev,
// import both below and export it under one short name.

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
import {
  AlertCircle as LAlertCircle,
  AlertTriangle as LAlertTriangle,
  ArrowDownRight as LArrowDownRight,
  ArrowLeft as LArrowLeft,
  ArrowRight as LArrowRight,
  ArrowUpRight as LArrowUpRight,
  Ban as LBan,
  Banknote as LBanknote,
  Bell as LBell,
  BellRing as LBellRing,
  Bold as LBold,
  BookOpen as LBookOpen,
  Braces as LBraces,
  Building2 as LBuilding2,
  Calendar as LCalendar,
  CalendarClock as LCalendarClock,
  CalendarDays as LCalendarDays,
  CalendarRange as LCalendarRange,
  Check as LCheck,
  CheckCheck as LCheckCheck,
  CheckCircle2 as LCheckCircle2,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronUp as LChevronUp,
  Circle as LCircle,
  CircleAlert as LCircleAlert,
  CircleCheck as LCircleCheck,
  Clock as LClock,
  Cloud as LCloud,
  CloudOff as LCloudOff,
  Copy as LCopy,
  CreditCard as LCreditCard,
  Download as LDownload,
  ExternalLink as LExternalLink,
  Eye as LEye,
  EyeOff as LEyeOff,
  FileSpreadsheet as LFileSpreadsheet,
  FileText as LFileText,
  FileUp as LFileUp,
  FlaskConical as LFlaskConical,
  Gauge as LGauge,
  Globe as LGlobe,
  HelpCircle as LHelpCircle,
  History as LHistory,
  Hourglass as LHourglass,
  Image as LImage,
  ImageOff as LImageOff,
  ImagePlus as LImagePlus,
  Inbox as LInbox,
  Info as LInfo,
  Italic as LItalic,
  KeyRound as LKeyRound,
  Landmark as LLandmark,
  Lightbulb as LLightbulb,
  Link as LLink,
  Loader2 as LLoader2,
  LogOut as LLogOut,
  MapPin as LMapPin,
  Megaphone as LMegaphone,
  Menu as LMenu,
  MessageCircle as LMessageCircle,
  MessageSquareQuote as LMessageSquareQuote,
  MessageSquareText as LMessageSquareText,
  Mic as LMic,
  MicOff as LMicOff,
  Monitor as LMonitor,
  Moon as LMoon,
  MoreHorizontal as LMoreHorizontal,
  Package as LPackage,
  PackageCheck as LPackageCheck,
  PackageOpen as LPackageOpen,
  Pause as LPause,
  PauseCircle as LPauseCircle,
  Pencil as LPencil,
  PencilLine as LPencilLine,
  Phone as LPhone,
  PhoneCall as LPhoneCall,
  PhoneIncoming as LPhoneIncoming,
  PhoneMissed as LPhoneMissed,
  PhoneOff as LPhoneOff,
  PhoneOutgoing as LPhoneOutgoing,
  Play as LPlay,
  Plus as LPlus,
  Printer as LPrinter,
  QrCode as LQrCode,
  Radio as LRadio,
  ReceiptText as LReceiptText,
  RefreshCw as LRefreshCw,
  Repeat as LRepeat,
  Reply as LReply,
  RotateCcw as LRotateCcw,
  RotateCw as LRotateCw,
  Search as LSearch,
  Send as LSend,
  Sheet as LSheet,
  ShieldAlert as LShieldAlert,
  ShieldCheck as LShieldCheck,
  ShoppingBag as LShoppingBag,
  ShoppingCart as LShoppingCart,
  SlidersHorizontal as LSlidersHorizontal,
  Smartphone as LSmartphone,
  Snail as LSnail,
  Sparkles as LSparkles,
  SquarePen as LSquarePen,
  Store as LStore,
  Strikethrough as LStrikethrough,
  Sun as LSun,
  Tags as LTags,
  Trash2 as LTrash2,
  TriangleAlert as LTriangleAlert,
  Truck as LTruck,
  Undo2 as LUndo2,
  Upload as LUpload,
  User as LUser,
  UserCheck as LUserCheck,
  UserPlus as LUserPlus,
  UserRound as LUserRound,
  UserX as LUserX,
  Users as LUsers,
  UsersRound as LUsersRound,
  Wallet as LWallet,
  X as LX,
  XCircle as LXCircle,
  Zap as LZap,
  type LucideIcon,
} from "lucide-react";
import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "children" | "strokeWidth"> & {
  /** Pixel size; usually left alone and set with a Tailwind size-* class instead. */
  size?: number | string;
  strokeWidth?: number;
};
export type IconComponent = ((props: IconProps) => React.JSX.Element) & { displayName?: string };

/** Slightly heavier than the 1.5 Hugeicons draws at, so 16px icons stay crisp next to text. */
const STROKE = 1.75;

function icon(svg: IconSvgElement, Classic: LucideIcon, name: string): IconComponent {
  const Icon = ({ size = 24, strokeWidth, className, ...rest }: IconProps) => {
    const hidden = rest["aria-label"] || rest.role ? undefined : true;
    return (
      <>
        <HugeiconsIcon icon={svg} size={size} strokeWidth={strokeWidth ?? STROKE} aria-hidden={hidden} focusable="false" {...rest} className={cn("ip-huge", className)} />
        <Classic size={size} strokeWidth={strokeWidth ?? 2} aria-hidden={hidden} focusable="false" {...rest} className={cn("ip-classic", className)} />
      </>
    );
  };
  Icon.displayName = name;
  return Icon;
}

export const AlertCircle = icon(AlertCircleIcon, LAlertCircle, "AlertCircle");
export const AlertTriangle = icon(Alert02Icon, LAlertTriangle, "AlertTriangle");
export const ArrowDownRight = icon(ArrowDownRight01Icon, LArrowDownRight, "ArrowDownRight");
export const ArrowLeft = icon(ArrowLeft02Icon, LArrowLeft, "ArrowLeft");
export const ArrowRight = icon(ArrowRight02Icon, LArrowRight, "ArrowRight");
export const ArrowUpRight = icon(ArrowUpRight01Icon, LArrowUpRight, "ArrowUpRight");
export const Ban = icon(UnavailableIcon, LBan, "Ban");
export const Banknote = icon(Money03Icon, LBanknote, "Banknote");
export const Bell = icon(Notification01Icon, LBell, "Bell");
export const BellRing = icon(Notification03Icon, LBellRing, "BellRing");
export const Bold = icon(TextBoldIcon, LBold, "Bold");
export const BookOpen = icon(BookOpen01Icon, LBookOpen, "BookOpen");
export const Braces = icon(SourceCodeIcon, LBraces, "Braces");
export const Building2 = icon(Building03Icon, LBuilding2, "Building2");
export const Calendar = icon(Calendar01Icon, LCalendar, "Calendar");
export const CalendarClock = icon(CalendarClockIcon, LCalendarClock, "CalendarClock");
export const CalendarDays = icon(Calendar03Icon, LCalendarDays, "CalendarDays");
export const CalendarRange = icon(Calendar04Icon, LCalendarRange, "CalendarRange");
export const Check = icon(Tick02Icon, LCheck, "Check");
export const CheckCheck = icon(TickDouble02Icon, LCheckCheck, "CheckCheck");
export const CheckCircle2 = icon(CheckmarkCircle02Icon, LCheckCircle2, "CheckCircle2");
export const ChevronDown = icon(ArrowDown01Icon, LChevronDown, "ChevronDown");
export const ChevronLeft = icon(ArrowLeft01Icon, LChevronLeft, "ChevronLeft");
export const ChevronRight = icon(ArrowRight01Icon, LChevronRight, "ChevronRight");
export const ChevronUp = icon(ArrowUp01Icon, LChevronUp, "ChevronUp");
export const Circle = icon(CircleIcon, LCircle, "Circle");
export const CircleAlert = icon(AlertCircleIcon, LCircleAlert, "CircleAlert");
export const CircleCheck = icon(CheckmarkCircle02Icon, LCircleCheck, "CircleCheck");
export const Clock = icon(Clock01Icon, LClock, "Clock");
export const Cloud = icon(CloudIcon, LCloud, "Cloud");
export const CloudOff = icon(CloudOffIcon, LCloudOff, "CloudOff");
export const Copy = icon(Copy01Icon, LCopy, "Copy");
export const CreditCard = icon(CreditCardIcon, LCreditCard, "CreditCard");
export const Download = icon(Download04Icon, LDownload, "Download");
export const ExternalLink = icon(LinkSquare02Icon, LExternalLink, "ExternalLink");
export const Eye = icon(ViewIcon, LEye, "Eye");
export const EyeOff = icon(ViewOffSlashIcon, LEyeOff, "EyeOff");
export const FileSpreadsheet = icon(Xls02Icon, LFileSpreadsheet, "FileSpreadsheet");
export const FileText = icon(File02Icon, LFileText, "FileText");
export const FileUp = icon(FileImportIcon, LFileUp, "FileUp");
export const FlaskConical = icon(TestTube01Icon, LFlaskConical, "FlaskConical");
export const Gauge = icon(DashboardSpeed01Icon, LGauge, "Gauge");
export const Globe = icon(GlobalIcon, LGlobe, "Globe");
export const HelpCircle = icon(HelpCircleIcon, LHelpCircle, "HelpCircle");
export const History = icon(HistoryIcon, LHistory, "History");
export const Hourglass = icon(HourglassIcon, LHourglass, "Hourglass");
export const Image = icon(Image01Icon, LImage, "Image");
export const ImageOff = icon(ImageNotFound01Icon, LImageOff, "ImageOff");
export const ImagePlus = icon(ImageAdd01Icon, LImagePlus, "ImagePlus");
export const Inbox = icon(InboxIcon, LInbox, "Inbox");
export const Info = icon(InformationCircleIcon, LInfo, "Info");
export const Italic = icon(TextItalicIcon, LItalic, "Italic");
export const KeyRound = icon(Key01Icon, LKeyRound, "KeyRound");
export const Landmark = icon(BankIcon, LLandmark, "Landmark");
export const Lightbulb = icon(Idea01Icon, LLightbulb, "Lightbulb");
export const Link = icon(Link01Icon, LLink, "Link");
export const Loader2 = icon(Loading03Icon, LLoader2, "Loader2");
export const LogOut = icon(Logout03Icon, LLogOut, "LogOut");
export const MapPin = icon(Location01Icon, LMapPin, "MapPin");
export const Megaphone = icon(Megaphone01Icon, LMegaphone, "Megaphone");
export const Menu = icon(Menu01Icon, LMenu, "Menu");
export const MessageCircle = icon(Message01Icon, LMessageCircle, "MessageCircle");
export const MessageSquareQuote = icon(QuoteDownSquareIcon, LMessageSquareQuote, "MessageSquareQuote");
export const MessageSquareText = icon(Message02Icon, LMessageSquareText, "MessageSquareText");
export const Mic = icon(Mic01Icon, LMic, "Mic");
export const MicOff = icon(MicOff01Icon, LMicOff, "MicOff");
export const Monitor = icon(ComputerIcon, LMonitor, "Monitor");
export const Moon = icon(Moon02Icon, LMoon, "Moon");
export const MoreHorizontal = icon(MoreHorizontalIcon, LMoreHorizontal, "MoreHorizontal");
export const Package = icon(Package03Icon, LPackage, "Package");
export const PackageCheck = icon(Package03Icon, LPackageCheck, "PackageCheck");
export const PackageOpen = icon(PackageOpenIcon, LPackageOpen, "PackageOpen");
export const Pause = icon(PauseIcon, LPause, "Pause");
export const PauseCircle = icon(PauseCircleIcon, LPauseCircle, "PauseCircle");
export const Pencil = icon(PencilEdit01Icon, LPencil, "Pencil");
export const PencilLine = icon(PencilEdit02Icon, LPencilLine, "PencilLine");
export const Phone = icon(Call02Icon, LPhone, "Phone");
export const PhoneCall = icon(CallIcon, LPhoneCall, "PhoneCall");
export const PhoneIncoming = icon(CallIncoming01Icon, LPhoneIncoming, "PhoneIncoming");
export const PhoneMissed = icon(CallMissed01Icon, LPhoneMissed, "PhoneMissed");
export const PhoneOff = icon(CallEnd01Icon, LPhoneOff, "PhoneOff");
export const PhoneOutgoing = icon(CallOutgoing01Icon, LPhoneOutgoing, "PhoneOutgoing");
export const Play = icon(PlayIcon, LPlay, "Play");
export const Plus = icon(Add01Icon, LPlus, "Plus");
export const Printer = icon(PrinterIcon, LPrinter, "Printer");
export const QrCode = icon(QrCodeIcon, LQrCode, "QrCode");
export const Radio = icon(LiveStreaming02Icon, LRadio, "Radio");
export const ReceiptText = icon(Invoice03Icon, LReceiptText, "ReceiptText");
export const RefreshCw = icon(RefreshIcon, LRefreshCw, "RefreshCw");
export const Repeat = icon(RepeatIcon, LRepeat, "Repeat");
export const Reply = icon(MailReply01Icon, LReply, "Reply");
export const RotateCcw = icon(UndoIcon, LRotateCcw, "RotateCcw");
export const RotateCw = icon(Refresh01Icon, LRotateCw, "RotateCw");
export const Search = icon(Search01Icon, LSearch, "Search");
export const Send = icon(SentIcon, LSend, "Send");
export const Sheet = icon(GoogleSheetIcon, LSheet, "Sheet");
export const ShieldAlert = icon(SecurityWarningIcon, LShieldAlert, "ShieldAlert");
export const ShieldCheck = icon(SecurityCheckIcon, LShieldCheck, "ShieldCheck");
export const ShoppingBag = icon(ShoppingBag02Icon, LShoppingBag, "ShoppingBag");
export const ShoppingCart = icon(ShoppingCart01Icon, LShoppingCart, "ShoppingCart");
export const SlidersHorizontal = icon(FilterHorizontalIcon, LSlidersHorizontal, "SlidersHorizontal");
export const Smartphone = icon(SmartPhone01Icon, LSmartphone, "Smartphone");
export const Snail = icon(SnailIcon, LSnail, "Snail");
export const Sparkles = icon(SparklesIcon, LSparkles, "Sparkles");
export const SquarePen = icon(Edit02Icon, LSquarePen, "SquarePen");
export const Store = icon(Store01Icon, LStore, "Store");
export const Strikethrough = icon(TextStrikethroughIcon, LStrikethrough, "Strikethrough");
export const Sun = icon(Sun03Icon, LSun, "Sun");
export const Tags = icon(Tag01Icon, LTags, "Tags");
export const Trash2 = icon(Delete02Icon, LTrash2, "Trash2");
export const TriangleAlert = icon(Alert02Icon, LTriangleAlert, "TriangleAlert");
export const Truck = icon(DeliveryTruck01Icon, LTruck, "Truck");
export const Undo2 = icon(Undo02Icon, LUndo2, "Undo2");
export const Upload = icon(Upload04Icon, LUpload, "Upload");
export const User = icon(UserIcon, LUser, "User");
export const UserCheck = icon(UserCheck01Icon, LUserCheck, "UserCheck");
export const UserPlus = icon(UserAdd01Icon, LUserPlus, "UserPlus");
export const UserRound = icon(UserCircleIcon, LUserRound, "UserRound");
export const UserX = icon(UserRemove01Icon, LUserX, "UserX");
export const Users = icon(UserMultiple02Icon, LUsers, "Users");
export const UsersRound = icon(UserGroupIcon, LUsersRound, "UsersRound");
export const Wallet = icon(Wallet01Icon, LWallet, "Wallet");
export const X = icon(Cancel01Icon, LX, "X");
export const XCircle = icon(CancelCircleIcon, LXCircle, "XCircle");
export const Zap = icon(FlashIcon, LZap, "Zap");
export const ImageIcon = Image;
