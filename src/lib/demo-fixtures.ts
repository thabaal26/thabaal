import "server-only";

/**
 * Thabaal Demo Workspace Fixtures.
 *
 * Provides realistic, richly structured synthetic data for accounts in DEMO mode.
 * All synthetic items are clearly and explicitly prefixed with [DEMO] or [SAMPLE]
 * so that users are never confused about real vs simulated data.
 *
 * Real customer records (e.g. Finforte's 128 imported contacts) and real Meta templates
 * are ALWAYS preserved and distinguished.
 */

export interface DemoMetricItem {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  detail: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  locality: string;
  tags: string[];
  ordersCount: number;
  totalSpend: number;
  lastActive: string;
  isSynthetic: true;
}

export interface DemoCampaign {
  id: string;
  name: string;
  status: "COMPLETED" | "SCHEDULED" | "DRAFT";
  templateName: string;
  recipientCount: number;
  deliveredCount: number;
  readRate: string;
  responseRate: string;
  scheduledFor?: string;
  isSynthetic: true;
}

export interface DemoTemplate {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING";
  language: string;
  headerType: string;
  previewText: string;
  isSynthetic: true;
}

export interface DemoOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: "DELIVERED" | "DISPATCHED" | "CONFIRMED" | "NEW";
  paymentStatus: "PAID" | "COD" | "PENDING";
  date: string;
  isSynthetic: true;
}

export interface DemoInboxMessage {
  id: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  time: string;
  unread: boolean;
  intent: "ORDER_INQUIRY" | "DELIVERY_STATUS" | "PAYMENT_CONFIRMATION";
  suggestedReply: string;
  isSynthetic: true;
}

export interface DemoProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  sku: string;
  isSynthetic: true;
}

export const DEMO_WORKSPACE_METRICS: DemoMetricItem[] = [
  {
    label: "Total Conversations",
    value: "1,420",
    change: "+18.4%",
    trend: "up",
    detail: "98.2% delivered via Meta Cloud API",
  },
  {
    label: "Catalogue GMV",
    value: "₹1,28,450",
    change: "+24.6%",
    trend: "up",
    detail: "114 completed WhatsApp cart orders",
  },
  {
    label: "Campaign Read Rate",
    value: "78.4%",
    change: "+6.2%",
    trend: "up",
    detail: "High-engagement South India audience",
  },
  {
    label: "Repeat Reorder Rate",
    value: "42.8%",
    change: "+9.1%",
    trend: "up",
    detail: "Driven by automated reorder reminders",
  },
];

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: "demo-cust-01",
    name: "[DEMO] Kavitha Raman",
    phone: "+91 98401 23456",
    locality: "Anna Nagar, Chennai",
    tags: ["[DEMO] VIP Loyal", "[DEMO] Cold-Pressed Fan"],
    ordersCount: 8,
    totalSpend: 14200,
    lastActive: "2 hours ago",
    isSynthetic: true,
  },
  {
    id: "demo-cust-02",
    name: "[DEMO] Suresh Babu",
    phone: "+91 94440 98765",
    locality: "KK Nagar, Madurai",
    tags: ["[DEMO] Regular Buyer", "[DEMO] Reorder Due"],
    ordersCount: 5,
    totalSpend: 7850,
    lastActive: "Yesterday",
    isSynthetic: true,
  },
  {
    id: "demo-cust-03",
    name: "[DEMO] Meenakshi Sundaram",
    phone: "+91 98840 54321",
    locality: "RS Puram, Coimbatore",
    tags: ["[DEMO] High-Value Buyer"],
    ordersCount: 12,
    totalSpend: 24600,
    lastActive: "3 days ago",
    isSynthetic: true,
  },
  {
    id: "demo-cust-04",
    name: "[DEMO] Karthik Narayanan",
    phone: "+91 97910 11223",
    locality: "Thillai Nagar, Trichy",
    tags: ["[DEMO] Lapsed Customer", "[DEMO] Winback Target"],
    ordersCount: 2,
    totalSpend: 2800,
    lastActive: "28 days ago",
    isSynthetic: true,
  },
  {
    id: "demo-cust-05",
    name: "[DEMO] Divya Prakash",
    phone: "+91 99620 44556",
    locality: "Velachery, Chennai",
    tags: ["[DEMO] New Customer"],
    ordersCount: 1,
    totalSpend: 1450,
    lastActive: "Just now",
    isSynthetic: true,
  },
];

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: "demo-camp-01",
    name: "[SAMPLE] Diwali Mega Festive Broadcast",
    status: "COMPLETED",
    templateName: "festive_oil_offer_2026",
    recipientCount: 850,
    deliveredCount: 834,
    readRate: "84.2%",
    responseRate: "28.6%",
    isSynthetic: true,
  },
  {
    id: "demo-camp-02",
    name: "[SAMPLE] Weekend Reorder Flash Nudge",
    status: "SCHEDULED",
    templateName: "monthly_refill_reminder",
    recipientCount: 320,
    deliveredCount: 0,
    readRate: "—",
    responseRate: "—",
    scheduledFor: "Saturday, 10:00 AM IST",
    isSynthetic: true,
  },
  {
    id: "demo-camp-03",
    name: "[SAMPLE] VIP Loyalty Point Multiplier (2x)",
    status: "DRAFT",
    templateName: "vip_loyalty_boost",
    recipientCount: 145,
    deliveredCount: 0,
    readRate: "—",
    responseRate: "—",
    isSynthetic: true,
  },
];

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: "demo-tpl-01",
    name: "[DEMO] festive_oil_offer_2026",
    category: "MARKETING",
    status: "APPROVED",
    language: "en",
    headerType: "IMAGE",
    previewText: "Vanakkam {{1}}! Special festive savings on authentic cold-pressed oils. Order directly on WhatsApp with free home delivery.",
    isSynthetic: true,
  },
  {
    id: "demo-tpl-02",
    name: "[DEMO] dispatch_tracking_update",
    category: "UTILITY",
    status: "APPROVED",
    language: "en",
    headerType: "TEXT",
    previewText: "Your order #{{1}} has been handed over to our courier partner. Track live parcel progress here: {{2}}.",
    isSynthetic: true,
  },
  {
    id: "demo-tpl-03",
    name: "[DEMO] monthly_refill_reminder",
    category: "MARKETING",
    status: "APPROVED",
    language: "en",
    headerType: "IMAGE",
    previewText: "Hi {{1}}, running low on your pure wood-pressed cooking oils? Tap below to repeat your previous order in 1 click.",
    isSynthetic: true,
  },
];

export const DEMO_ORDERS: DemoOrder[] = [
  {
    id: "demo-ord-01",
    orderNumber: "DM-1042",
    customerName: "[DEMO] Kavitha Raman",
    customerPhone: "+91 98401 23456",
    items: [
      { name: "Cold-Pressed Sesame Oil (1L)", qty: 2, price: 420 },
      { name: "Wood-Pressed Coconut Oil (1L)", qty: 1, price: 380 },
    ],
    total: 1220,
    status: "DELIVERED",
    paymentStatus: "PAID",
    date: "13 Nov 2026, 02:30 PM",
    isSynthetic: true,
  },
  {
    id: "demo-ord-02",
    orderNumber: "DM-1043",
    customerName: "[DEMO] Suresh Babu",
    customerPhone: "+91 94440 98765",
    items: [
      { name: "Traditional Groundnut Oil (2L)", qty: 1, price: 680 },
      { name: "Pure Cow Ghee (500ml)", qty: 1, price: 450 },
    ],
    total: 1130,
    status: "DISPATCHED",
    paymentStatus: "PAID",
    date: "13 Nov 2026, 04:15 PM",
    isSynthetic: true,
  },
  {
    id: "demo-ord-03",
    orderNumber: "DM-1044",
    customerName: "[DEMO] Meenakshi Sundaram",
    customerPhone: "+91 98840 54321",
    items: [
      { name: "Cold-Pressed Sesame Oil (5L Can)", qty: 1, price: 1950 },
    ],
    total: 1950,
    status: "CONFIRMED",
    paymentStatus: "COD",
    date: "13 Nov 2026, 05:40 PM",
    isSynthetic: true,
  },
  {
    id: "demo-ord-04",
    orderNumber: "DM-1045",
    customerName: "[DEMO] Divya Prakash",
    customerPhone: "+91 99620 44556",
    items: [
      { name: "Wood-Pressed Coconut Oil (1L)", qty: 1, price: 380 },
      { name: "Natural Palm Jaggery (1kg)", qty: 1, price: 180 },
    ],
    total: 560,
    status: "NEW",
    paymentStatus: "PENDING",
    date: "13 Nov 2026, 07:10 PM",
    isSynthetic: true,
  },
];

export const DEMO_INBOX_MESSAGES: DemoInboxMessage[] = [
  {
    id: "demo-msg-01",
    customerName: "[DEMO] Kavitha Raman",
    customerPhone: "+91 98401 23456",
    lastMessage: "Parcel received safely! The packaging was excellent, thank you so much 🙏",
    time: "10m ago",
    unread: false,
    intent: "PAYMENT_CONFIRMATION",
    suggestedReply: "Thank you so much Kavitha ma'am! Delighted to serve your family pure cold-pressed oils. Nandri!",
    isSynthetic: true,
  },
  {
    id: "demo-msg-02",
    customerName: "[DEMO] Suresh Babu",
    customerPhone: "+91 94440 98765",
    lastMessage: "Do you deliver to KK Nagar Madurai? Can I pay cash on delivery?",
    time: "24m ago",
    unread: true,
    intent: "ORDER_INQUIRY",
    suggestedReply: "Yes Suresh sir! We deliver to KK Nagar daily with free delivery and Cash on Delivery is gladly available.",
    isSynthetic: true,
  },
  {
    id: "demo-msg-03",
    customerName: "[DEMO] Divya Prakash",
    customerPhone: "+91 99620 44556",
    lastMessage: "I have submitted the cart for 1L Coconut Oil. How do I complete payment?",
    time: "45m ago",
    unread: true,
    intent: "ORDER_INQUIRY",
    suggestedReply: "I have sent the instant UPI payment card right above. Simply tap 'Review & Pay' to checkout via GPay or PhonePe.",
    isSynthetic: true,
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "demo-prod-01",
    name: "[DEMO] Mara Chekku Sesame Oil (1 Litre)",
    category: "Cooking Oils",
    price: 420,
    stock: 120,
    sku: "THN-SES-1L",
    isSynthetic: true,
  },
  {
    id: "demo-prod-02",
    name: "[DEMO] Pure Wood-Pressed Coconut Oil (1 Litre)",
    category: "Cooking Oils",
    price: 380,
    stock: 85,
    sku: "THN-COC-1L",
    isSynthetic: true,
  },
  {
    id: "demo-prod-03",
    name: "[DEMO] Traditional Groundnut Oil (1 Litre)",
    category: "Cooking Oils",
    price: 340,
    stock: 160,
    sku: "THN-GND-1L",
    isSynthetic: true,
  },
  {
    id: "demo-prod-04",
    name: "[DEMO] Village Pure Desi Cow Ghee (500ml)",
    category: "Dairy & Ghee",
    price: 450,
    stock: 45,
    sku: "THN-GHEE-500",
    isSynthetic: true,
  },
];
