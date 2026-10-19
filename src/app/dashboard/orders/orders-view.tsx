"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useModalKeys } from "@/components/use-modal";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { toastResult } from "@/components/toast";
import { fmtDate } from "@/lib/format";
import { inr } from "../portal-format";
import { T, useLang } from "../portal-ui";
import { DEFAULT_FLOW, flowHas, flowPacks, flowSteps, isCodOrder, isConfirmedOrLater, isPaidOrder, orderStage, readFlow, stepLabel, type OrderFlowKey } from "@/lib/order-flow";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { orderRef, type OrderItem } from "@/lib/order-ref";
import { dayStartIST } from "@/lib/filters";
import { createOrder, lookupOrderCustomer } from "../actions/orders";
import { OrderCard, type OrderCardData } from "./order-card";
import type { CatalogProductOption } from "./order-items-editor";
import { Clock, Package, PackageCheck, ShoppingBag } from "@/components/icons";
import { Stat } from "@/components/ui";
import {
  downloadOrdersCsv,
  downloadOrdersExcel,
  downloadOrdersImage,
  openPrintablePdfWindow,
  type ExportableOrderRow,
  type ExportablePickItem,
} from "./packing/print-button";

export type OrdersViewProps = {
  orders: OrderCardData[];
  catalogProducts: CatalogProductOption[];
  client: {
    name: string;
    orderFlow: OrderFlowKey;
    paymentConfig: boolean;
  };
  canEdit: boolean;
  scopeClientId: string | null;
  initialShow?: string;
  initialPay?: string;
  initialSrc?: string;
  initialDate?: string;
  initialQ?: string;
  initialTab?: "orders" | "pack";
};

/** Lists other pages link to; shown as a removable chip so it's clear the list is narrowed. */
const SPECIAL_SHOW: Record<string, [string, string]> = {
  unpaid: ["Not paid yet", "பணம் வராதவை"],
  refund: ["Refunds due", "திருப்பித் தர வேண்டியவை"],
  topack: ["To pack", "பேக் செய்ய வேண்டியவை"],
  paid: ["Paid or COD", "பணம் / COD"],
};

export function OrdersView({
  orders: initialOrders,
  catalogProducts,
  client,
  canEdit,
  scopeClientId,
  initialShow = "all",
  initialPay = "all",
  initialSrc = "all",
  initialDate = "all",
  initialQ = "",
  initialTab = "orders",
}: OrdersViewProps) {
  const router = useRouter();
  const lang = useLang();
  const isTa = lang === "ta";
  // Packing list switched off (owner, 18 Oct 2026): only the Orders panel shows. The tab and its panel are kept
  // (commented out / never reached) so it can come back; was useState(initialTab) with setActiveTab.
  void initialTab;
  const [activeTab] = useState<"orders" | "pack">("orders");
  const [show, setShow] = useState<string>(initialShow);
  const [payFilter, setPayFilter] = useState<string>(initialPay);
  // "chat" was an old option that matched the same orders as "catalogue"; old links fall back to everything.
  const [srcFilter, setSrcFilter] = useState<string>(initialSrc === "chat" ? "all" : initialSrc);
  const [dateFilter, setDateFilter] = useState<string>(initialDate);
  const [query, setQuery] = useState<string>(initialQ);
  const [exportOpen, setExportOpen] = useState(false);

  // Packing list state
  const [packFilter, setPackFilter] = useState<"all" | "paid" | "cod">("all");
  const [packSort, setPackSort] = useState<"old" | "new">("old");

  // New order modal state
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  // The New order form is a dialog: focus goes into it, Escape closes it, and focus returns to the button.
  useModalKeys(newOrderOpen, () => setNewOrderOpen(false), "neworder");
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  // The number decides who the order is for: an existing customer (name and address filled in from
  // their record or WhatsApp chat) or a new one, who is saved as a customer when the order is saved.
  const [who, setWho] = useState<{ digits: string; state: "checking" | "new" | "existing"; name?: string } | null>(null);
  const newDigits = newCustPhone.replace(/\D/g, "");
  useEffect(() => {
    if (newDigits.length < 10) return;
    let live = true;
    const t = setTimeout(async () => {
      setWho({ digits: newDigits, state: "checking" });
      const r = await lookupOrderCustomer(newDigits).catch(() => ({ valid: false as const }));
      if (!live) return;
      if (!r.valid) return setWho(null);
      if (!r.existing) return setWho({ digits: newDigits, state: "new" });
      const ex = r.existing;
      setWho({ digits: newDigits, state: "existing", name: ex.name });
      if (!/^\+?\d+$/.test(ex.name.trim())) setNewCustName((prev) => (prev.trim() ? prev : ex.name));
      const addr = ex.locationRaw?.trim() || ex.location?.trim() || ex.chatAddresses[0]?.fullAddress || "";
      if (addr) setNewAddress((prev) => (prev.trim() ? prev : addr));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [newDigits]);
  const whoNow = who && who.digits === newDigits && newDigits.length >= 10 ? who : null;
  const [newItems, setNewItems] = useState<{ name: string; price: number; qty: number }[]>([]);
  const [selectedProdIdx, setSelectedProdIdx] = useState<string>("0");
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState<string>("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [newOrderError, setNewOrderError] = useState("");
  const [savingOrder, startOrderTransition] = useTransition();

  const flow = readFlow(client.orderFlow ?? DEFAULT_FLOW);
  const steps = flowSteps(flow);
  const hasPack = flowPacks(flow);
  const hasDispatch = flowHas(flow, "DISPATCHED");
  const finishLabel = stepLabel(flow, "DELIVERED") ?? "Delivered";
  const confirmLabel = stepLabel(flow, "CONFIRMED") ?? "Order confirmed";

  // Steps: received › payment processing › payment verification › confirmed › dispatched › delivered.
  const isOrderPaid = (o: OrderCardData) => isPaidOrder(o);
  const isOrderCod = (o: OrderCardData) => isCodOrder(o);
  const stageIs = (o: OrderCardData, st: string) => orderStage(o) === st;
  const preDispatch = (o: OrderCardData) => o.status === "NEW" || o.status === "CONFIRMED" || o.status === "PAID";
  const toPack = (o: OrderCardData) => isConfirmedOrLater(o) && preDispatch(o) && !o.packedAt;

  // Date filter helper (matches against order received timestamp o.createdAt in Asia/Kolkata)
  const isDateMatch = (createdAt: Date | string, range: string) => {
    if (!range || range === "all") return true;
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return true;
    const now = new Date();
    const today = dayStartIST(now);
    const orderDay = dayStartIST(d);
    const orderTime = d.getTime();

    switch (range) {
      case "today":
        return orderDay.getTime() === today.getTime();
      case "yesterday": {
        const yesterday = new Date(today.getTime() - 86400000);
        return orderDay.getTime() === yesterday.getTime();
      }
      case "7d": {
        const sevenDaysAgo = new Date(today.getTime() - 6 * 86400000);
        return orderTime >= sevenDaysAgo.getTime();
      }
      case "30d": {
        const thirtyDaysAgo = new Date(today.getTime() - 29 * 86400000);
        return orderTime >= thirtyDaysAgo.getTime();
      }
      case "month": {
        const monthStart = dayStartIST(new Date(now.getFullYear(), now.getMonth(), 1));
        return orderTime >= monthStart.getTime();
      }
      case "lastmonth": {
        const lastMonthStart = dayStartIST(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const thisMonthStart = dayStartIST(new Date(now.getFullYear(), now.getMonth(), 1));
        return orderTime >= lastMonthStart.getTime() && orderTime < thisMonthStart.getTime();
      }
      default:
        return true;
    }
  };

  // Filtered orders for "orders" panel
  const qClean = query.trim().toLowerCase();

  // 1. Base filtered orders (respects Date received, Source, and Search query)
  // This ensures top stats and chip counts respect the active date, source, and search filters!
  const baseFilteredOrders = initialOrders.filter((o) => {
    // Date filter: when order was received
    if (!isDateMatch(o.createdAt, dateFilter)) return false;

    // Source filter
    const fromCampaign = !!o.waMessageId && !!o.internalNote && /campaign/i.test(o.internalNote);
    if (srcFilter === "cat" && (!o.waMessageId || fromCampaign)) return false;
    if (srcFilter === "camp" && !fromCampaign) return false;
    if (srcFilter === "manual" && o.waMessageId) return false;

    // Search query filter
    if (qClean) {
      const itemsStr = (o.items as OrderItem[]).map((i) => i.name ?? i.id).join(" ");
      const combined = `${o.number} ${orderRef(o)} ${o.customer.name} ${o.customer.phone} ${itemsStr} ${o.note ?? ""} ${o.internalNote ?? ""} ${o.paymentUtr ?? ""} ${o.paymentTxnId ?? ""}`.toLowerCase();
      if (!combined.includes(qClean)) return false;
    }

    return true;
  });

  const allCount = baseFilteredOrders.length;
  const newCount = baseFilteredOrders.filter((o) => stageIs(o, "RECEIVED")).length;
  const paymentCount = baseFilteredOrders.filter((o) => stageIs(o, "PAYMENT")).length;
  const verifyCount = baseFilteredOrders.filter((o) => stageIs(o, "VERIFY")).length;
  const confirmedCount = baseFilteredOrders.filter((o) => stageIs(o, "CONFIRMED")).length;
  const packedCount = baseFilteredOrders.filter((o) => o.packedAt != null && preDispatch(o)).length;
  const dispatchedCount = baseFilteredOrders.filter((o) => o.status === "DISPATCHED").length;
  const deliveredCount = baseFilteredOrders.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = baseFilteredOrders.filter((o) => o.status === "CANCELLED").length;

  const unpaidOrders = baseFilteredOrders.filter(
    (o) => o.status !== "CANCELLED" && !isOrderPaid(o) && !isOrderCod(o),
  );
  const waitingSum = unpaidOrders.reduce((sum, o) => {
    const p = getOrderPricing((o.items as OrderItem[]) ?? [], o.total, {
      applyDefaultWhenEqual: true,
      discount: pointsDiscount(o),
    });
    return sum + p.total;
  }, 0);

  const toPackCount = baseFilteredOrders.filter(toPack).length;

  // 2. Final filtered orders (also applies Status tab 'show' and Payment dropdown 'payFilter')
  const filteredOrders = baseFilteredOrders.filter((o) => {
    // Step filter
    if (show === "new" && !stageIs(o, "RECEIVED")) return false;
    if (show === "payment" && !stageIs(o, "PAYMENT")) return false;
    if (show === "verify" && !stageIs(o, "VERIFY")) return false;
    if (show === "confirmed" && !stageIs(o, "CONFIRMED")) return false;
    if (show === "paid" && !isOrderPaid(o) && !isOrderCod(o)) return false;
    // "To pack" (from the To pack card and Home): confirmed (paid or COD confirmed), not packed yet.
    if (show === "topack" && !toPack(o)) return false;
    if (show === "packed" && !(o.packedAt != null && preDispatch(o))) return false;
    if (show === "dispatched" && o.status !== "DISPATCHED") return false;
    if (show === "done" && o.status !== "DELIVERED") return false;
    if (show === "cancelled" && o.status !== "CANCELLED") return false;
    // Lists other pages link to (Home, Reports, Products): not paid yet, refunds due.
    if (show === "unpaid" && !(o.status !== "CANCELLED" && !isOrderPaid(o) && !isOrderCod(o))) return false;
    if (show === "refund" && !(o.status === "CANCELLED" && isOrderPaid(o) && !o.refundedAt)) return false;

    // Payment dropdown filter
    if (payFilter === "none" && (isOrderPaid(o) || o.paymentRequestedAt != null)) return false;
    if (payFilter === "sent" && (isOrderPaid(o) || o.paymentRequestedAt == null)) return false;
    if (payFilter === "paid" && !isOrderPaid(o)) return false;
    if (payFilter === "cod" && !isOrderCod(o)) return false;

    return true;
  });

  // Packing list orders (confirmed or paid orders waiting for dispatch)
  const waitingPackOrders = initialOrders.filter(
    (o) => isConfirmedOrLater(o) && preDispatch(o),
  );

  const packFiltered = waitingPackOrders
    .filter((o) => {
      if (packFilter === "paid" && !isOrderPaid(o)) return false;
      if (packFilter === "cod" && !isOrderCod(o)) return false;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return packSort === "old" ? da - db : db - da;
    });

  // Group packing list by Area
  const areaMap = new Map<string, OrderCardData[]>();
  for (const o of packFiltered) {
    const area = o.customer.location?.trim() || o.customer.locationRaw?.trim() || "Area not noted";
    areaMap.set(area, [...(areaMap.get(area) ?? []), o]);
  }
  const areaGroups = [...areaMap.entries()].map(([area, list]) => ({ area, orders: list }));

  // Pull from stock: aggregated quantities across all waiting pack orders
  const stockMap = new Map<string, number>();
  for (const o of waitingPackOrders) {
    for (const item of (o.items as OrderItem[]) ?? []) {
      const name = item.name ?? item.id ?? "Item";
      stockMap.set(name, (stockMap.get(name) ?? 0) + (item.quantity || 1));
    }
  }
  const stockPicks: ExportablePickItem[] = [...stockMap.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  // Convert for exports
  const exportableOrders: ExportableOrderRow[] = filteredOrders.map((o) => {
    const itms = (o.items as OrderItem[]).map((i) => ({
      name: i.name ?? i.id ?? "Item",
      quantity: i.quantity || 1,
      price: i.price || 0,
    }));
    const p = getOrderPricing(itms, o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) });
    return {
      id: o.id,
      orderRef: orderRef(o),
      createdAt: fmtDate(new Date(o.createdAt), "EEE d MMM, h:mm a"),
      status: o.status,
      isPaid: isOrderPaid(o),
      payLabel: isOrderPaid(o) ? "PAID" : isOrderCod(o) ? "COD" : "UNPAID",
      collect: isOrderPaid(o) ? 0 : p.total,
      customerName: o.customer.name,
      customerPhone: o.customer.phone,
      area: o.customer.location?.trim() || "Area not noted",
      address: o.note?.trim() || o.customer.locationRaw?.trim() || "",
      items: itms,
      total: p.total,
      currency: o.currency || "INR",
      note: [o.note, o.internalNote].filter(Boolean).join(" · "),
    };
  });

  // Export handlers
  const handleExportPdf = () => {
    setExportOpen(false);
    openPrintablePdfWindow(exportableOrders, stockPicks, `Orders · ${show}`);
  };
  const handleExportImage = () => {
    setExportOpen(false);
    downloadOrdersImage(exportableOrders, stockPicks, `Orders · ${show}`, "orders");
  };
  const handleExportExcel = () => {
    setExportOpen(false);
    downloadOrdersExcel(exportableOrders, stockPicks, "orders");
  };
  const handleExportCsv = () => {
    setExportOpen(false);
    downloadOrdersCsv(exportableOrders, "orders");
  };

  // Add Item in New Order form
  const handleAddItem = () => {
    if (selectedProdIdx === "custom") {
      const name = customItemName.trim();
      const price = parseFloat(customItemPrice) || 0;
      if (!name || price <= 0) {
        setNewOrderError("Problem: type the item name and its price.");
        return;
      }
      setNewOrderError("");
      const existing = newItems.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        setNewItems(newItems.map((x) => (x.name === existing.name ? { ...x, qty: x.qty + itemQty } : x)));
      } else {
        setNewItems([...newItems, { name, price, qty: itemQty }]);
      }
      setCustomItemName("");
      setCustomItemPrice("");
      setItemQty(1);
    } else {
      const p = catalogProducts[parseInt(selectedProdIdx, 10)];
      if (!p) return;
      setNewOrderError("");
      const existing = newItems.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (existing) {
        setNewItems(newItems.map((x) => (x.name === existing.name ? { ...x, qty: x.qty + itemQty } : x)));
      } else {
        setNewItems([...newItems, { name: p.name, price: p.priceAmount, qty: itemQty }]);
      }
      setItemQty(1);
    }
  };

  const handleRemoveItem = (idx: number) => {
    setNewItems(newItems.filter((_, i) => i !== idx));
  };

  const newOrderTotal = newItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  // Submit New Order
  const handleSaveNewOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = newCustPhone.replace(/\D/g, "");
    // 10 digits, or with the country code (91…); the server normalises it.
    if (phoneClean.length < 10 || phoneClean.length > 13) {
      setNewOrderError("Problem: add the customer's WhatsApp number (10 digits).");
      return;
    }
    if (!newCustName.trim() && whoNow?.state !== "existing") {
      setNewOrderError("Problem: this is a new customer, so add their name.");
      return;
    }
    if (newItems.length === 0) {
      setNewOrderError("Problem: add at least one item from the list.");
      return;
    }

    startOrderTransition(async () => {
      const r = await createOrder({
        name: newCustName.trim(),
        phone: phoneClean,
        items: newItems.map((item) => ({
          name: item.name,
          quantity: item.qty,
          price: item.price,
        })),
        address: newAddress.trim(),
        paymentMode: "later",
      });
      toastResult(r);
      if (r.ok) {
        setNewOrderOpen(false);
        setNewCustName("");
        setNewCustPhone("");
        setNewAddress("");
        setWho(null);
        setNewItems([]);
        setNewOrderError("");
        router.refresh();
      } else {
        setNewOrderError(r.message ?? "Could not save order.");
      }
    });
  };

  return (
    <>
      {/* Top Tabs: Orders vs Packing list. Switched off with the packing list (owner, 18 Oct 2026):
      <div className="tabs" data-tabs role="tablist">
        <button
          type="button"
          role="tab"
          data-tab="orders"
          data-ta="ஆர்டர்கள்"
          aria-selected={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
        >
          <T ta="ஆர்டர்கள்">Orders</T>
        </button>
        <button
          type="button"
          role="tab"
          data-tab="pack"
          data-ta="பேக்கிங்"
          aria-selected={activeTab === "pack"}
          onClick={() => setActiveTab("pack")}
        >
          <T ta="பேக்கிங்">Packing list</T>
        </button>
      </div>
      */}

      {/* Panel 1: Orders */}
      {activeTab === "orders" && (
        <section data-panel="orders">
          {/* Top KPI 4-Card Strip */}
          <div className="grid g4 keep2" id="ok" style={{ marginBottom: 18, gap: 16 }}>
            <Stat
              label={isTa ? "வந்த ஆர்டர்கள்" : "Orders received"}
              labelTa="வந்த ஆர்டர்கள்"
              value={newCount}
              sub={isTa ? "பணம் இணைப்பு அனுப்பவும்" : "Send the payment link"}
              subTa="பணம் இணைப்பு அனுப்பவும்"
              icon={<ShoppingBag className="size-4 shrink-0" />}
              tone="brand"
              onClick={() => setShow("new")}
            />
            <Stat
              label={isTa ? "பணம் வர வேண்டியவை" : "Payment waiting"}
              labelTa="பணம் வர வேண்டியவை"
              value={inr(waitingSum)}
              sub={isTa ? "இன்னும் வரவில்லை" : "Not received yet"}
              subTa="இன்னும் வரவில்லை"
              icon={<Clock className="size-4 shrink-0" />}
              tone="amber"
              onClick={() => {
                setShow("all");
                setPayFilter("none");
              }}
            />
            <Stat
              label={hasPack ? (isTa ? "பேக் செய்ய வேண்டியவை" : "To pack") : (isTa ? "முடிக்க வேண்டியவை" : "To finish")}
              labelTa={hasPack ? "பேக் செய்ய வேண்டியவை" : "முடிக்க வேண்டியவை"}
              value={toPackCount}
              sub={isTa ? "உறுதியான ஆர்டர்கள்" : "Confirmed orders"}
              subTa="உறுதியான ஆர்டர்கள்"
              icon={<Package className="size-4 shrink-0" />}
              tone="info"
              onClick={() => setShow("topack")}
            />
            <Stat
              label={hasDispatch ? (isTa ? "அனுப்பப்பட்டவை" : "Dispatched") : (isTa ? "இன்று முடித்தவை" : "Finished today")}
              labelTa={hasDispatch ? "அனுப்பப்பட்டவை" : "இன்று முடித்தவை"}
              value={dispatchedCount}
              sub={hasDispatch ? (isTa ? "டெலிவரிக்கு சென்றவை" : "Out for delivery") : (isTa ? "இன்று முடித்தவை" : "Completed today")}
              subTa={hasDispatch ? "டெலிவரிக்கு சென்றவை" : "இன்று முடித்தவை"}
              icon={<PackageCheck className="size-4 shrink-0" />}
              tone="violet"
              onClick={() => setShow("dispatched")}
            />
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <div className="search">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                id="oq"
                placeholder={isTa ? "வாடிக்கையாளர், தொலைபேசி, ஆர்டர் எண் தேடுக" : "Search customer, phone, order or item"}
                aria-label={isTa ? "ஆர்டர்களைத் தேடுக" : "Search orders"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Date filter dropdown */}
            <select
              id="fd"
              aria-label={isTa ? "ஆர்டர் வந்த தேதி" : "Order received date"}
              style={{ width: "auto" }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">{isTa ? "தேதி: அனைத்தும்" : "Date: all time"}</option>
              <option value="today">{isTa ? "தேதி: இன்று" : "Date: today"}</option>
              <option value="yesterday">{isTa ? "தேதி: நேற்று" : "Date: yesterday"}</option>
              <option value="7d">{isTa ? "தேதி: கடந்த 7 நாட்கள்" : "Date: last 7 days"}</option>
              <option value="30d">{isTa ? "தேதி: கடந்த 30 நாட்கள்" : "Date: last 30 days"}</option>
              <option value="month">{isTa ? "தேதி: இந்த மாதம்" : "Date: this month"}</option>
              <option value="lastmonth">{isTa ? "தேதி: கடந்த மாதம்" : "Date: last month"}</option>
            </select>

            <select
              id="fp"
              aria-label="Payment status"
              style={{ width: "auto" }}
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
            >
              <option value="all">{isTa ? "பணம்: அனைத்தும்" : "Payment: all"}</option>
              <option value="none">{isTa ? "பணம்: வர வேண்டியவை" : "Payment: waiting"}</option>
              <option value="sent">{isTa ? "பணம்: இணைப்பு அனுப்பப்பட்டது" : "Payment: link sent"}</option>
              <option value="paid">{isTa ? "பணம்: செலுத்தப்பட்டது" : "Payment: paid"}</option>
              <option value="cod">{isTa ? "பணம்: டெலிவரியின் போது (COD)" : "Payment: cash on delivery"}</option>
            </select>

            <select
              id="fs"
              aria-label="Where the order came from"
              style={{ width: "auto" }}
              value={srcFilter}
              onChange={(e) => setSrcFilter(e.target.value)}
            >
              <option value="all">{isTa ? "வகை: அனைத்தும்" : "From: everywhere"}</option>
              <option value="cat">{isTa ? "வகை: பட்டியல்" : "From: catalogue"}</option>
              <option value="camp">{isTa ? "வகை: பிரச்சாரம்" : "From: campaign"}</option>
              <option value="manual">{isTa ? "வகை: கைமுறை பதிவு" : "From: manual entry"}</option>
            </select>

            {/* Export Details Dropdown */}
            <details
              className="more"
              open={exportOpen}
              onToggle={(e) => setExportOpen((e.target as HTMLDetailsElement).open)}
              style={{ border: 0, margin: 0, padding: 0, position: "relative" }}
            >
              <summary className="btn" style={{ listStyle: "none", cursor: "pointer" }}>
                <T ta="ஏற்றுமதி">Export</T>
              </summary>
              <div
                className="card"
                style={{
                  position: "absolute",
                  zIndex: 25,
                  padding: 8,
                  minWidth: 170,
                  marginTop: 6,
                  right: 0,
                }}
              >
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleExportPdf}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleExportImage}
                >
                  <T ta="பகிர்வதற்கான படம்">Image to share</T>
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleExportExcel}
                >
                  <T>Excel</T>
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleExportCsv}
                >
                  CSV
                </button>
              </div>
            </details>

            {/* New Order Trigger */}
            <button
              type="button"
              className="btn primary"
              style={{ marginLeft: "auto" }}
              aria-haspopup="dialog"
              onClick={() => setNewOrderOpen(true)}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <T ta="புதிய ஆர்டர்">New order</T>
            </button>
          </div>

          {/* Filter Chips */}
          <div className="chips" id="oc" style={{ marginBottom: 14 }}>
            {SPECIAL_SHOW[show] && (
              <button type="button" className="chip" aria-pressed onClick={() => setShow("all")} aria-label={isTa ? "இந்த வடிகட்டியை நீக்கு" : "Clear this filter"}>
                {isTa ? SPECIAL_SHOW[show][1] : SPECIAL_SHOW[show][0]} <small>{filteredOrders.length}</small> <span aria-hidden>×</span>
              </button>
            )}
            {dateFilter !== "all" && (
              <button
                type="button"
                className="chip"
                aria-pressed
                onClick={() => setDateFilter("all")}
                aria-label={isTa ? "தேதி வடிகட்டியை நீக்கு" : "Clear date filter"}
              >
                {dateFilter === "today"
                  ? isTa ? "தேதி: இன்று" : "Date: Today"
                  : dateFilter === "yesterday"
                  ? isTa ? "தேதி: நேற்று" : "Date: Yesterday"
                  : dateFilter === "7d"
                  ? isTa ? "தேதி: கடந்த 7 நாட்கள்" : "Date: Last 7 days"
                  : dateFilter === "30d"
                  ? isTa ? "தேதி: கடந்த 30 நாட்கள்" : "Date: Last 30 days"
                  : dateFilter === "month"
                  ? isTa ? "தேதி: இந்த மாதம்" : "Date: This month"
                  : dateFilter === "lastmonth"
                  ? isTa ? "தேதி: கடந்த மாதம்" : "Date: Last month"
                  : `Date: ${dateFilter}`} <span aria-hidden>×</span>
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-pressed={show === "all"}
              onClick={() => setShow("all")}
            >
              <T ta="அனைத்தும்">All</T> <small>{allCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "new"}
              onClick={() => setShow("new")}
            >
              <T ta="வந்தவை">Received</T> <small>{newCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "payment"}
              onClick={() => setShow("payment")}
            >
              <T ta="பணம் செலுத்துதல்">Payment processing</T> <small>{paymentCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "verify"}
              onClick={() => setShow("verify")}
            >
              <T ta="பணம் சரிபார்ப்பு">Payment verification</T> <small>{verifyCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "confirmed"}
              onClick={() => setShow("confirmed")}
            >
              <T ta="உறுதியானவை">{confirmLabel}</T> <small>{confirmedCount}</small>
            </button>
            {hasPack && (
              <button
                type="button"
                className="chip"
                aria-pressed={show === "packed"}
                onClick={() => setShow("packed")}
              >
                <T ta="பேக் செய்தவை">Packed</T> <small>{packedCount}</small>
              </button>
            )}
            {hasDispatch && (
              <button
                type="button"
                className="chip"
                aria-pressed={show === "dispatched"}
                onClick={() => setShow("dispatched")}
              >
                <T ta="அனுப்பியவை">Dispatched</T> <small>{dispatchedCount}</small>
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-pressed={show === "done"}
              onClick={() => setShow("done")}
            >
              <T ta={finishLabel === "Delivered" ? "டெலிவரி ஆனவை" : finishLabel}>{finishLabel}</T> <small>{deliveredCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "cancelled"}
              onClick={() => setShow("cancelled")}
            >
              <T ta="ரத்து செய்தவை">Cancelled</T> <small>{cancelledCount}</small>
            </button>
          </div>

          {/* Steps Line */}
          <div
            style={{
              margin: "2px 0 16px",
              fontSize: 13,
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span><T ta="நிலைகள்:">Steps:</T></span>
            <span id="flowline" style={{ fontWeight: 500 }}>
              {steps.map((f, i) => (
                <Fragment key={f.key}>
                  {i > 0 && <span style={{ opacity: 0.45, margin: "0 4px", userSelect: "none" }}>›</span>}
                  <span>{isTa ? f.ta : f.label}</span>
                </Fragment>
              ))}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <Link href="/dashboard/settings#order-steps" className="linkb" style={{ fontSize: 13, fontWeight: 600 }}>
              <T ta="நிலைகளை மாற்று">Change steps</T>
            </Link>
          </div>

          {/* Orders Stack */}
          <div className="stack" id="ol">
            {filteredOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                items={(o.items as OrderItem[]) ?? []}
                showClient={!scopeClientId}
                canEdit={canEdit}
                catalogProducts={catalogProducts}
                flow={flow}
              />
            ))}
          </div>

          {filteredOrders.length === 0 && (
            <p className="muted" id="oe">
              <T ta="பொருத்தமான ஆர்டர்கள் எதுவும் இல்லை.">No orders match.</T>
            </p>
          )}
        </section>
      )}

      {/* Panel 2: Packing List. Never shown now (activeTab stays "orders"); kept for when it comes back. */}
      {activeTab === "pack" && (
        <section data-panel="pack">
          <div className="grid split">
            <div>
              <div className="chips" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={packFilter === "all"}
                  onClick={() => setPackFilter("all")}
                >
                  All <small>{waitingPackOrders.length}</small>
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={packFilter === "paid"}
                  onClick={() => setPackFilter("paid")}
                >
                  Paid <small>{waitingPackOrders.filter(isOrderPaid).length}</small>
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={packFilter === "cod"}
                  onClick={() => setPackFilter("cod")}
                >
                  <T>Cash on delivery</T> <small>{waitingPackOrders.filter(isOrderCod).length}</small>
                </button>
                <div className="seg" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>
                  <button
                    type="button"
                    aria-pressed={packSort === "old"}
                    onClick={() => setPackSort("old")}
                  >
                    <T>Oldest first</T>
                  </button>
                  <button
                    type="button"
                    aria-pressed={packSort === "new"}
                    onClick={() => setPackSort("new")}
                  >
                    <T>Newest first</T>
                  </button>
                </div>
              </div>

              {/* Area Grouped Cards */}
              <div className="stack" id="ord-pl">
                {areaGroups.map((grp) => (
                  <div key={grp.area} className="card">
                    <div className="hd" style={{ marginBottom: 8 }}>
                      <h2 style={{ fontSize: 17 }} data-data>{grp.area}</h2>
                      <span className="muted small"><T ta={`${grp.orders.length} ஆர்டர்கள்`}>{`${grp.orders.length} orders`}</T></span>
                    </div>
                    {grp.orders.map((o) => {
                      const itms = (o.items as OrderItem[]) ?? [];
                      const paid = isOrderPaid(o);
                      return (
                        <div key={o.id} className="row">
                          <div className="grow">
                            <div className="t">
                              #{orderRef(o)} · {o.customer.name}
                            </div>
                            <div className="muted small">
                              {itms.map((i) => `${i.quantity} × ${i.name ?? i.id}`).join(", ")}
                            </div>
                          </div>
                          <span className={`pill ${paid ? "ok" : "info"}`}>
                            <T>{paid ? "Paid" : "Cash on delivery"}</T>
                          </span>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              const itmsArr = (o.items as OrderItem[]).map((i) => ({
                                name: i.name ?? i.id ?? "Item",
                                quantity: i.quantity || 1,
                                price: i.price || 0,
                              }));
                              const p = getOrderPricing(itmsArr, o.total, {
                                applyDefaultWhenEqual: true,
                                discount: pointsDiscount(o),
                              });
                              openPrintablePdfWindow(
                                [
                                  {
                                    id: o.id,
                                    orderRef: orderRef(o),
                                    createdAt: fmtDate(new Date(o.createdAt), "EEE d MMM, h:mm a"),
                                    status: o.status,
                                    isPaid: paid,
                                    payLabel: paid ? "PAID" : "COD",
                                    collect: paid ? 0 : p.total,
                                    customerName: o.customer.name,
                                    customerPhone: o.customer.phone,
                                    area: grp.area,
                                    address: o.note?.trim() || o.customer.locationRaw?.trim() || "",
                                    items: itmsArr,
                                    total: p.total,
                                    currency: o.currency || "INR",
                                    note: [o.note, o.internalNote].filter(Boolean).join(" · "),
                                  },
                                ],
                                [],
                                `Order #${orderRef(o)}`,
                              );
                            }}
                          >
                            <T>Slip</T>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {areaGroups.length === 0 && (
                  <p className="muted" style={{ padding: "16px 0" }}>
                    No orders waiting to pack.
                  </p>
                )}
              </div>
            </div>

            {/* Right: Pull From Stock Card */}
            <div className="card" style={{ alignSelf: "start" }}>
              <div className="hd">
                <div>
                  <h2><T>Pull from stock</T></h2>
                  <p><T>One total for all waiting orders.</T></p>
                </div>
              </div>
              <div className="list">
                {stockPicks.map((p) => (
                  <div key={p.name} className="row">
                    <div className="grow t">{p.name}</div>
                    <b>{p.quantity}</b>
                  </div>
                ))}
                {stockPicks.length === 0 && (
                  <p className="muted small">Nothing to pull.</p>
                )}
              </div>
              <div className="tools" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadOrdersImage([], stockPicks, "Stock Pull List", "stock-pull")}
                >
                  <T>Share as image</T>
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadOrdersExcel([], stockPicks, "stock-pull")}
                >
                  <T>Excel</T>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Modal Dialog: New Order (Matching #neworder) */}
      {newOrderOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            background: "rgba(16,40,59,.55)",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewOrderOpen(false);
          }}
        >
          <form
            className="dlg card"
            id="neworder"
            role="dialog"
            aria-modal="true"
            aria-labelledby="neworder-title"
            style={{ width: "min(520px, calc(100vw - 32px))" }}
            onSubmit={handleSaveNewOrder}
          >
            <h2 id="neworder-title">New order</h2>
            <p className="muted">For phone or walk-in orders.</p>

            <div className="field">
              <label htmlFor="nop">WhatsApp number</label>
              <input
                id="nop"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="98765 43210"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                aria-describedby="nowho"
                autoFocus
                required
              />
              <p id="nowho" className="muted small" role="status" aria-live="polite" style={{ minHeight: 18 }}>
                {whoNow?.state === "checking" && (isTa ? "தேடுகிறது…" : "Looking up this number…")}
                {whoNow?.state === "existing" &&
                  (isTa ? `ஏற்கனவே உள்ள வாடிக்கையாளர்: ${whoNow.name}. பெயரும் முகவரியும் நிரப்பப்பட்டன.` : `Existing customer: ${whoNow.name}. Name and address filled in.`)}
                {whoNow?.state === "new" &&
                  (isTa ? "புதிய எண்: ஆர்டரைச் சேமிக்கும்போது வாடிக்கையாளராகச் சேர்க்கப்படுவார்." : "New number: they're added as a customer when you save the order.")}
              </p>
            </div>

            <div className="field">
              <label htmlFor="noc">Customer name</label>
              <input
                id="noc"
                type="text"
                autoComplete="name"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Name as the customer gives it"
                required={whoNow?.state !== "existing"}
              />
            </div>

            <div className="field">
              <label htmlFor="nos">Items</label>
              <div className="tools">
                <select
                  id="nos"
                  style={{ flex: 1, minWidth: 180 }}
                  aria-label="Choose a product"
                  value={selectedProdIdx}
                  onChange={(e) => setSelectedProdIdx(e.target.value)}
                >
                  {catalogProducts.map((p, idx) => (
                    <option key={p.id} value={idx.toString()} disabled={!p.inStock}>
                      {p.name} · ₹{p.priceAmount}
                      {!p.inStock ? " · out of stock" : ""}
                    </option>
                  ))}
                  <option value="custom">Something else (type it)</option>
                </select>
                <input
                  id="noq"
                  type="number"
                  value={itemQty}
                  min={1}
                  style={{ width: 84 }}
                  aria-label="How many"
                  onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <button type="button" className="btn primary" id="noadd" onClick={handleAddItem}>
                  Add
                </button>
              </div>

              {selectedProdIdx === "custom" && (
                <div className="tools" id="nocw" style={{ marginTop: 8 }}>
                  <input
                    id="noc2"
                    type="text"
                    placeholder="Item name"
                    style={{ flex: 1, minWidth: 160 }}
                    aria-label="Item name"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                  />
                  <input
                    id="nop2"
                    type="number"
                    placeholder="Price ₹"
                    style={{ width: 120 }}
                    aria-label="Price"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                  />
                </div>
              )}

              {/* Items List */}
              <div className="list" id="noil" style={{ marginTop: 6 }}>
                {newItems.map((item, idx) => (
                  <div key={idx} className="row">
                    <div className="grow">
                      <div className="t">
                        {item.qty} × {item.name}
                      </div>
                      <div className="muted small">₹{item.price} each</div>
                    </div>
                    <b>{inr(item.price * item.qty)}</b>
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {newItems.length > 0 && (
                <div
                  className="row"
                  id="notot"
                  style={{ borderTop: "2px solid var(--line)", marginTop: 8 }}
                >
                  <div className="grow t">Total</div>
                  <b id="notv" style={{ font: "600 20px var(--display)" }}>
                    {inr(newOrderTotal)}
                  </b>
                </div>
              )}

              <p className="muted small" id="noe" style={{ marginTop: 8 }}>
                Pick from your catalogue.{" "}
                <Link href="/dashboard/catalogue">Add a product</Link> if something is missing.
              </p>
            </div>

            <div className="field">
              <label htmlFor="noa">Delivery address</label>
              <textarea
                id="noa"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Door No, Street, Area, Landmark"
              />
            </div>

            {newOrderError && <div className="msg err">{newOrderError}</div>}

            <div className="acts">
              <button type="button" className="btn" onClick={() => setNewOrderOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={savingOrder}>
                {savingOrder ? "Saving…" : "Save order"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
