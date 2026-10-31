// What the business's Google Sheet looks like: eight tabs, each about one thing, with plain headings a shop owner
// reads without help. Pure (no database, no Google), so the rows and their wording are unit-tested.
//
//   Summary      today, this month, waiting, all time, top products and customers (rewritten as it changes)
//   Customers    one row per customer, kept up to date                      key: Phone
//   Addresses    one row per delivery address a customer has used           key: Address ID
//   Orders       one row per order, kept up to date                         key: Order no
//   Order Items  one row per item in an order (for product-wise reports)    key: Line
//   Payments     every payment and refund, as it happens                    (added below, never changed)
//   Chats        every WhatsApp message, both ways                          (added below, never changed)
//   Activity     what happened: orders placed, paid, packed, cancelled...   (added below, never changed)
//
// Dates are real dates (sortable, filterable) in India time; money is a number shown as ₹; phone numbers are text.
import { createHash } from "node:crypto";

export type ColKind = "text" | "phone" | "money" | "int" | "date" | "datetime" | "link" | "status";
export type Col = { h: string; kind: ColKind; w: number };
export type TabKey = "summary" | "customers" | "addresses" | "orders" | "items" | "payments" | "chats" | "activity";
export type Tab = { key: TabKey; title: string; color: string; keyed: boolean; cols: Col[] };

const c = (h: string, kind: ColKind, w: number): Col => ({ h, kind, w });

export const TABS: Tab[] = [
  { key: "summary", title: "Summary", color: "#FFC329", keyed: false, cols: [c("", "text", 260), c("", "text", 170), c("", "text", 40), c("", "text", 300), c("", "text", 90), c("", "text", 130)] },
  {
    key: "customers",
    title: "Customers",
    color: "#7C5CFF",
    keyed: true,
    cols: [
      c("Phone", "phone", 150),
      c("Name", "text", 170),
      c("Area", "text", 140),
      c("Delivery address", "text", 320),
      c("Map", "link", 120),
      c("Orders", "int", 80),
      c("Total spent", "money", 120),
      c("Average order", "money", 120),
      c("First order", "date", 110),
      c("Last order", "date", 110),
      c("Last message", "datetime", 160),
      c("Customer since", "date", 120),
      c("Tags", "text", 180),
      c("Came from", "text", 170),
      c("Messages", "status", 130),
    ],
  },
  {
    key: "addresses",
    title: "Addresses",
    color: "#20C985",
    keyed: true,
    cols: [
      c("Address ID", "text", 110),
      c("Phone", "phone", 150),
      c("Name", "text", 170),
      c("Address", "text", 360),
      c("Area", "text", 140),
      c("Pincode", "text", 90),
      c("Map", "link", 120),
      c("Orders", "int", 80),
      c("First used", "date", 110),
      c("Last used", "date", 110),
    ],
  },
  {
    key: "orders",
    title: "Orders",
    color: "#2B5C86",
    keyed: true,
    cols: [
      c("Order no", "text", 110),
      c("Placed on", "datetime", 160),
      c("Customer", "text", 170),
      c("Phone", "phone", 150),
      c("Items", "text", 320),
      c("Qty", "int", 60),
      c("Total", "money", 110),
      c("Paid", "money", 110),
      c("Balance", "money", 110),
      c("Payment method", "text", 150),
      c("Payment status", "status", 160),
      c("Order status", "status", 170),
      c("Delivery address", "text", 320),
      c("Map", "link", 120),
      c("Delivered on", "datetime", 160),
      c("Source", "text", 140),
      c("Last update", "datetime", 160),
    ],
  },
  {
    key: "items",
    title: "Order Items",
    color: "#4F8FD6",
    keyed: true,
    cols: [
      c("Line", "text", 130),
      c("Order no", "text", 110),
      c("Placed on", "date", 110),
      c("Customer", "text", 170),
      c("Phone", "phone", 150),
      c("Product", "text", 260),
      c("SKU", "text", 120),
      c("Qty", "int", 60),
      c("Price", "money", 100),
      c("Line total", "money", 110),
      c("Order status", "status", 170),
    ],
  },
  {
    key: "payments",
    title: "Payments",
    color: "#0E9F6E",
    keyed: false,
    cols: [
      c("Time", "datetime", 160),
      c("Order no", "text", 110),
      c("Customer", "text", 170),
      c("Phone", "phone", 150),
      c("Type", "status", 100),
      c("Via", "text", 160),
      c("Amount", "money", 110),
      c("Reference", "text", 190),
      c("Result", "status", 120),
      c("Note", "text", 280),
    ],
  },
  {
    key: "chats",
    title: "Chats",
    color: "#25D366",
    keyed: false,
    cols: [
      c("Time", "datetime", 160),
      c("Phone", "phone", 150),
      c("Customer", "text", 170),
      c("Direction", "status", 140),
      c("Type", "text", 110),
      c("Message", "text", 440),
      c("By", "text", 170),
    ],
  },
  {
    key: "activity",
    title: "Activity",
    color: "#C0412A",
    keyed: false,
    cols: [
      c("Time", "datetime", 160),
      c("Phone", "phone", 150),
      c("Customer", "text", 170),
      c("Event", "text", 280),
      c("Details", "text", 320),
      c("Order no", "text", 110),
      c("By", "text", 120),
    ],
  },
];

export const tabOf = (key: TabKey) => TABS.find((x) => x.key === key)!;
export type Cell = string | number | null;

/* ---------- values ---------- */

const IST_MS = 5.5 * 3_600_000;
/** A Google Sheets date (days since 30 Dec 1899) in India time, so it sorts and filters as a real date. */
export const sheetDate = (d: Date | null | undefined): Cell => (d ? Math.round(((d.getTime() + IST_MS) / 86_400_000 + 25569) * 1e6) / 1e6 : null);
/** Rupees, rounded to paise. */
const amt = (n: number | null | undefined): Cell => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
/** "+91 98765 43210" for an Indian mobile, "+<digits>" otherwise. */
export function phoneText(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`;
}
/** Text cut to what a cell should hold. */
const t = (s: string | null | undefined, max = 500): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** A customer known only by their number shows as "-" for a name. */
const nameText = (name: string | null | undefined) => (!name || name.trim().startsWith("+") || /^\d+$/.test(name.trim()) ? "-" : t(name, 120));

/** A short, stable id for one address of one customer. */
export function addressId(phone: string, address: string) {
  const norm = address.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim();
  return `A-${createHash("sha1").update(`${phone}|${norm}`).digest("hex").slice(0, 8)}`;
}
/** The 6-digit pincode in an Indian address, if there is one. */
export const pincodeOf = (address: string) => /\b(\d{6})\b/.exec(address)?.[1] ?? "";

/* ---------- rows ---------- */

export type CustomerIn = {
  phone: string;
  name: string;
  area: string | null;
  address: string | null;
  mapUrl: string | null;
  orders: number;
  spent: number;
  firstOrder: Date | null;
  lastOrder: Date | null;
  lastMessage: Date | null;
  since: Date;
  tags: string[];
  cameFrom: string | null;
  optedOut: boolean;
  unreachable: boolean;
};
export function customerRow(x: CustomerIn): Cell[] {
  const tags = x.tags.filter((g) => !g.startsWith("src:")).join(", ");
  return [
    phoneText(x.phone),
    nameText(x.name),
    t(x.area, 120),
    t(x.address),
    x.mapUrl ?? "",
    x.orders,
    amt(x.spent),
    x.orders ? amt(x.spent / x.orders) : null,
    sheetDate(x.firstOrder),
    sheetDate(x.lastOrder),
    sheetDate(x.lastMessage),
    sheetDate(x.since),
    t(tags, 300),
    t(x.cameFrom, 160),
    x.optedOut ? "Opted out" : x.unreachable ? "Not on WhatsApp" : "Allowed",
  ];
}

export type AddressIn = { phone: string; name: string; address: string; area: string | null; mapUrl: string | null; orders: number; first: Date | null; last: Date | null };
export function addressRow(x: AddressIn): Cell[] {
  return [addressId(x.phone, x.address), phoneText(x.phone), nameText(x.name), t(x.address), t(x.area, 120), pincodeOf(x.address), x.mapUrl ?? "", x.orders, sheetDate(x.first), sheetDate(x.last)];
}

export type OrderItemIn = { id?: string | null; name?: string | null; quantity?: number | string | null; price?: number | string | null };
export type OrderIn = {
  ref: string;
  createdAt: Date;
  updatedAt: Date;
  customer: string;
  phone: string;
  items: OrderItemIn[];
  total: number;
  paid: number;
  due: number;
  method: string;
  payStatus: string;
  status: string;
  address: string | null;
  mapUrl: string | null;
  deliveredAt: Date | null;
  source: string;
};
const qtyOf = (i: OrderItemIn) => Math.max(0, Number(i.quantity) || 1);
const priceOf = (i: OrderItemIn) => Number(i.price) || 0;
/** "2 × Coconut oil 1L, 1 × Ghee 500 ml" */
export const itemsText = (items: OrderItemIn[]) => items.map((i) => `${qtyOf(i)} × ${t(i.name ?? i.id ?? "Item", 80)}`).join(", ");

export function orderRow(x: OrderIn): Cell[] {
  return [
    x.ref,
    sheetDate(x.createdAt),
    nameText(x.customer),
    phoneText(x.phone),
    t(itemsText(x.items), 1000),
    x.items.reduce((s, i) => s + qtyOf(i), 0),
    amt(x.total),
    amt(x.paid),
    amt(x.due),
    x.method,
    x.payStatus,
    x.status,
    t(x.address),
    x.mapUrl ?? "",
    sheetDate(x.deliveredAt),
    x.source,
    sheetDate(x.updatedAt),
  ];
}

export const lineKey = (ref: string, n: number) => `${ref} #${n}`;
/** One row per item; lines past the order's current items (removed by staff) are marked so the sheet stays honest. */
export function itemRows(x: OrderIn, previousLines = 0): { key: string; row: Cell[] }[] {
  const out = x.items.map((i, n) => ({
    key: lineKey(x.ref, n + 1),
    row: [lineKey(x.ref, n + 1), x.ref, sheetDate(x.createdAt), nameText(x.customer), phoneText(x.phone), t(i.name ?? i.id ?? "Item", 200), t(i.id, 80), qtyOf(i), amt(priceOf(i)), amt(priceOf(i) * qtyOf(i)), x.status] as Cell[],
  }));
  for (let n = x.items.length + 1; n <= previousLines; n++)
    out.push({ key: lineKey(x.ref, n), row: [lineKey(x.ref, n), x.ref, sheetDate(x.createdAt), nameText(x.customer), phoneText(x.phone), "(removed from the order)", "", 0, 0, 0, x.status] });
  return out;
}

export type PaymentIn = { at: Date; ref: string; customer: string; phone: string; refund: boolean; via: string; amount: number | null; reference: string | null; result: string; note: string | null };
export const paymentRow = (x: PaymentIn): Cell[] => [
  sheetDate(x.at),
  x.ref,
  nameText(x.customer),
  phoneText(x.phone),
  x.refund ? "Refund" : "Payment",
  x.via,
  amt(x.amount),
  t(x.reference, 120),
  x.result,
  t(x.note, 300),
];

export type ChatIn = { at: Date; phone: string; customer: string; incoming: boolean; type: string; text: string; by: string };
export const chatRow = (x: ChatIn): Cell[] => [sheetDate(x.at), phoneText(x.phone), nameText(x.customer), x.incoming ? "Customer → Shop" : "Shop → Customer", x.type, t(x.text, 600), x.by];

export type ActivityIn = { at: Date; phone: string | null; customer: string | null; event: string; details: string | null; orderRef: string | null; by: string | null };
export const activityRow = (x: ActivityIn): Cell[] => [sheetDate(x.at), phoneText(x.phone), nameText(x.customer), t(x.event, 200), t(x.details, 400), x.orderRef ?? "", x.by ?? ""];

/* ---------- summary ---------- */

export type SummaryIn = {
  shop: string;
  updated: Date;
  today: { orders: number; sales: number; newCustomers: number; chats: number };
  month: { label: string; orders: number; sales: number; online: number; cod: number; newCustomers: number };
  waiting: { carts: number; cartValue: number; codToCollect: number; codOrders: number; toDispatch: number };
  allTime: { customers: number; orders: number; sales: number };
  topProducts: { name: string; qty: number; sales: number }[];
  topCustomers: { name: string; phone: string; orders: number; spent: number }[];
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const IST_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** Rows of the Summary tab that are section headings (bold, shaded). Zero-based. */
export const SUMMARY_HEADINGS = [3, 9, 17, 22];
/** The Summary tab as a grid (rows of 6 cells): figures on the left, top products and customers on the right. */
export function summaryGrid(s: SummaryIn): Cell[][] {
  const L: [string, string][] = [
    [`${s.shop} · live sheet`, ""],
    [`Updated ${IST_FMT.format(s.updated)}`, ""],
    ["", ""],
    ["TODAY", ""],
    ["Orders", String(s.today.orders)],
    ["Sales", inr(s.today.sales)],
    ["New customers", String(s.today.newCustomers)],
    ["Messages from customers", String(s.today.chats)],
    ["", ""],
    [`THIS MONTH (${s.month.label.toUpperCase()})`, ""],
    ["Orders", String(s.month.orders)],
    ["Sales", inr(s.month.sales)],
    ["Paid online", inr(s.month.online)],
    ["Cash on delivery", inr(s.month.cod)],
    ["Average order", s.month.orders ? inr(s.month.sales / s.month.orders) : "-"],
    ["New customers", String(s.month.newCustomers)],
    ["", ""],
    ["WAITING", ""],
    ["Unfinished carts", `${s.waiting.carts} · ${inr(s.waiting.cartValue)}`],
    ["To pack and send", String(s.waiting.toDispatch)],
    ["Cash to collect (COD)", `${s.waiting.codOrders} · ${inr(s.waiting.codToCollect)}`],
    ["", ""],
    ["ALL TIME", ""],
    ["Customers", String(s.allTime.customers)],
    ["Orders", String(s.allTime.orders)],
    ["Sales", inr(s.allTime.sales)],
  ];
  const R: [string, string, string][] = [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["TOP PRODUCTS THIS MONTH", "QTY", "SALES"],
    ...s.topProducts.slice(0, 5).map((p): [string, string, string] => [t(p.name, 80), String(p.qty), inr(p.sales)]),
  ];
  if (s.topProducts.length === 0) R.push(["No sales yet this month", "", ""]);
  while (R.length < 9) R.push(["", "", ""]);
  R.push(["TOP CUSTOMERS (ALL TIME)", "ORDERS", "SPENT"]);
  for (const x of s.topCustomers.slice(0, 5)) R.push([`${nameText(x.name)} · ${phoneText(x.phone)}`, String(x.orders), inr(x.spent)]);
  if (s.topCustomers.length === 0) R.push(["No sales yet", "", ""]);
  const rows = Math.max(L.length, R.length, 30);
  const out: Cell[][] = [];
  for (let i = 0; i < rows; i++) {
    const [a, b] = L[i] ?? ["", ""];
    const [d, e, f] = R[i] ?? ["", "", ""];
    out.push([a, b, "", d, e, f]);
  }
  return out;
}
/** Right-hand headings of the Summary tab (zero-based rows). */
export const SUMMARY_RIGHT_HEADINGS = [3, 9];
