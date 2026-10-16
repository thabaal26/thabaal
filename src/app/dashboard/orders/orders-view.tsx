"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { toastResult } from "@/components/toast";
import { fmtDate } from "@/lib/format";
import { inr } from "../portal-format";
import { T } from "../portal-ui";
import { DEFAULT_FLOW, flowHas, flowSteps, readFlow, stepLabel, type OrderFlowKey } from "@/lib/order-flow";
import { getOrderPricing, pointsDiscount } from "@/lib/order-pricing";
import { orderRef, type OrderItem } from "@/lib/order-ref";
import { createOrder } from "../actions/orders";
import { OrderCard, type OrderCardData } from "./order-card";
import type { CatalogProductOption } from "./order-items-editor";
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
  initialQ?: string;
  initialTab?: "orders" | "pack";
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
  initialQ = "",
  initialTab = "orders",
}: OrdersViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"orders" | "pack">(initialTab);
  const [show, setShow] = useState<string>(initialShow);
  const [payFilter, setPayFilter] = useState<string>(initialPay);
  const [srcFilter, setSrcFilter] = useState<string>(initialSrc);
  const [query, setQuery] = useState<string>(initialQ);
  const [exportOpen, setExportOpen] = useState(false);

  // Packing list state
  const [packFilter, setPackFilter] = useState<"all" | "paid" | "cod">("all");
  const [packSort, setPackSort] = useState<"old" | "new">("old");

  // New order modal state
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newItems, setNewItems] = useState<{ name: string; price: number; qty: number }[]>([]);
  const [selectedProdIdx, setSelectedProdIdx] = useState<string>("0");
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState<string>("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [newOrderError, setNewOrderError] = useState("");
  const [savingOrder, startOrderTransition] = useTransition();

  const flow = readFlow(client.orderFlow ?? DEFAULT_FLOW);
  const steps = flowSteps(flow);
  const hasConfirm = flowHas(flow, "CONFIRMED");
  const hasPack = flowHas(flow, "PACKED");
  const hasDispatch = flowHas(flow, "DISPATCHED");
  const finishLabel = stepLabel(flow, "DELIVERED") ?? "Delivered";

  // Counts across all orders
  const isOrderPaid = (o: OrderCardData) => o.status === "PAID" || o.paidAt !== null;
  const isOrderCod = (o: OrderCardData) =>
    !isOrderPaid(o) &&
    (o.paymentMethod === "cod" || (o.internalNote && /cod|cash on delivery/i.test(o.internalNote)));

  const allCount = initialOrders.length;
  const newCount = initialOrders.filter((o) => o.status === "NEW").length;
  const confirmedCount = initialOrders.filter((o) => o.status === "CONFIRMED").length;
  const paidCount = initialOrders.filter((o) => isOrderPaid(o) || isOrderCod(o)).length;
  const packedCount = initialOrders.filter((o) => o.packedAt != null && o.status !== "CANCELLED").length;
  const dispatchedCount = initialOrders.filter((o) => o.status === "DISPATCHED").length;
  const deliveredCount = initialOrders.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = initialOrders.filter((o) => o.status === "CANCELLED").length;

  const unpaidOrders = initialOrders.filter(
    (o) => o.status !== "CANCELLED" && !isOrderPaid(o) && !isOrderCod(o),
  );
  const waitingSum = unpaidOrders.reduce((sum, o) => {
    const p = getOrderPricing((o.items as OrderItem[]) ?? [], o.total, {
      applyDefaultWhenEqual: true,
      discount: pointsDiscount(o),
    });
    return sum + p.total;
  }, 0);

  const toPackCount = initialOrders.filter(
    (o) => (o.status === "CONFIRMED" || o.status === "PAID") && !o.packedAt,
  ).length;

  // Filtered orders for "orders" panel
  const qClean = query.trim().toLowerCase();
  const filteredOrders = initialOrders.filter((o) => {
    // Tab filter
    if (show === "new" && o.status !== "NEW") return false;
    if (show === "confirmed" && o.status !== "CONFIRMED") return false;
    if (show === "paid" && !isOrderPaid(o) && !isOrderCod(o)) return false;
    if (show === "packed" && (o.packedAt == null || o.status === "CANCELLED")) return false;
    if (show === "dispatched" && o.status !== "DISPATCHED") return false;
    if (show === "done" && o.status !== "DELIVERED") return false;
    if (show === "cancelled" && o.status !== "CANCELLED") return false;

    // Payment dropdown filter
    if (payFilter === "none" && (isOrderPaid(o) || o.paymentRequestedAt != null)) return false;
    if (payFilter === "sent" && (isOrderPaid(o) || o.paymentRequestedAt == null)) return false;
    if (payFilter === "paid" && !isOrderPaid(o)) return false;
    if (payFilter === "cod" && !isOrderCod(o)) return false;

    // Source dropdown filter
    if (srcFilter === "cat" && !o.waMessageId) return false;
    if (srcFilter === "camp" && (!o.waMessageId || !o.internalNote || !/campaign/i.test(o.internalNote))) return false;
    if (srcFilter === "chat" && !o.waMessageId) return false;
    if (srcFilter === "manual" && o.waMessageId) return false;

    // Search query filter
    if (qClean) {
      const itemsStr = (o.items as OrderItem[]).map((i) => i.name ?? i.id).join(" ");
      const combined = `${o.number} ${orderRef(o)} ${o.customer.name} ${o.customer.phone} ${itemsStr} ${o.note ?? ""} ${o.internalNote ?? ""}`.toLowerCase();
      if (!combined.includes(qClean)) return false;
    }

    return true;
  });

  // Packing list orders (confirmed or paid orders waiting for dispatch)
  const waitingPackOrders = initialOrders.filter(
    (o) => (o.status === "CONFIRMED" || o.status === "PAID" || o.packedAt != null) && o.status !== "DISPATCHED" && o.status !== "DELIVERED" && o.status !== "CANCELLED",
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
    if (!newCustName.trim() || phoneClean.length !== 10) {
      setNewOrderError("Problem: add the customer name and a 10-digit number.");
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
      {/* Top Tabs: Orders vs Packing list */}
      <div className="tabs" data-tabs role="tablist">
        <button
          type="button"
          data-tab="orders"
          data-ta="ஆர்டர்கள்"
          aria-selected={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
        >
          <T ta="ஆர்டர்கள்">Orders</T>
        </button>
        <button
          type="button"
          data-tab="pack"
          data-ta="பேக்கிங்"
          aria-selected={activeTab === "pack"}
          onClick={() => setActiveTab("pack")}
        >
          <T ta="பேக்கிங்">Packing list</T>
        </button>
      </div>

      {/* Panel 1: Orders */}
      {activeTab === "orders" && (
        <section data-panel="orders">
          {/* Top KPI 4-Card Strip */}
          <div className="grid g4 keep2" id="ok" style={{ marginBottom: 16 }}>
            <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setShow("new")}>
              <div className="l">New orders</div>
              <div className="v">{newCount}</div>
              <div className="d muted">{hasConfirm ? "Confirm these first" : "Take payment"}</div>
            </div>
            <div className="card stat" style={{ cursor: "pointer" }} onClick={() => { setShow("all"); setPayFilter("none"); }}>
              <div className="l">Payment waiting</div>
              <div className="v">{inr(waitingSum)}</div>
              <div className="d muted">Not received yet</div>
            </div>
            <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setActiveTab("pack")}>
              <div className="l">{hasPack ? "To pack" : "To finish"}</div>
              <div className="v">{toPackCount}</div>
              <div className="d muted">Paid or COD</div>
            </div>
            <div className="card stat" style={{ cursor: "pointer" }} onClick={() => setShow("dispatched")}>
              <div className="l">{hasDispatch ? "Dispatched" : "Finished today"}</div>
              <div className="v">{dispatchedCount}</div>
              <div className="d muted"></div>
            </div>
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
                placeholder="Search customer, phone, order or item"
                aria-label="Search orders"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <select
              id="fp"
              aria-label="Payment status"
              style={{ width: "auto" }}
              value={payFilter}
              onChange={(e) => setPayFilter(e.target.value)}
            >
              <option value="all">Payment: all</option>
              <option value="none">Payment: waiting</option>
              <option value="sent">Payment: link sent</option>
              <option value="paid">Payment: paid</option>
              <option value="cod">Payment: cash on delivery</option>
            </select>

            <select
              id="fs"
              aria-label="Where the order came from"
              style={{ width: "auto" }}
              value={srcFilter}
              onChange={(e) => setSrcFilter(e.target.value)}
            >
              <option value="all">From: everywhere</option>
              <option value="cat">From: catalogue</option>
              <option value="camp">From: campaign</option>
              <option value="chat">From: chat</option>
              <option value="manual">From: manual entry</option>
            </select>

            {/* Export Details Dropdown */}
            <details
              className="more"
              open={exportOpen}
              onToggle={(e) => setExportOpen((e.target as HTMLDetailsElement).open)}
              style={{ border: 0, margin: 0, padding: 0, position: "relative" }}
            >
              <summary className="btn" style={{ listStyle: "none", cursor: "pointer" }}>
                Export
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
                  Image to share
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleExportExcel}
                >
                  Excel
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
              onClick={() => setNewOrderOpen(true)}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New order
            </button>
          </div>

          {/* Filter Chips */}
          <div className="chips" id="oc" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "all"}
              onClick={() => setShow("all")}
            >
              All <small>{allCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "new"}
              onClick={() => setShow("new")}
            >
              New <small>{newCount}</small>
            </button>
            {hasConfirm && (
              <button
                type="button"
                className="chip"
                aria-pressed={show === "confirmed"}
                onClick={() => setShow("confirmed")}
              >
                Confirmed <small>{confirmedCount}</small>
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-pressed={show === "paid"}
              onClick={() => setShow("paid")}
            >
              Paid / COD <small>{paidCount}</small>
            </button>
            {hasPack && (
              <button
                type="button"
                className="chip"
                aria-pressed={show === "packed"}
                onClick={() => setShow("packed")}
              >
                Packed <small>{packedCount}</small>
              </button>
            )}
            {hasDispatch && (
              <button
                type="button"
                className="chip"
                aria-pressed={show === "dispatched"}
                onClick={() => setShow("dispatched")}
              >
                Dispatched <small>{dispatchedCount}</small>
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-pressed={show === "done"}
              onClick={() => setShow("done")}
            >
              {finishLabel} <small>{deliveredCount}</small>
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={show === "cancelled"}
              onClick={() => setShow("cancelled")}
            >
              Cancelled <small>{cancelledCount}</small>
            </button>
          </div>

          {/* Steps Line */}
          <p className="muted small" style={{ margin: "-6px 0 14px" }}>
            Steps: <span id="flowline">{steps.map((f) => f.label).join(" › ")}</span> ·{" "}
            <Link href="/dashboard/settings#order-steps">
              <b>Change steps</b>
            </Link>
          </p>

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
              No orders match.
            </p>
          )}
        </section>
      )}

      {/* Panel 2: Packing List */}
      {activeTab === "pack" && (
        <section data-panel="pack">
          <div className="grid split">
            <div>
              <div className="chips" style={{ marginBottom: 14 }}>
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
                  Cash on delivery <small>{waitingPackOrders.filter(isOrderCod).length}</small>
                </button>
                <div className="seg" style={{ marginLeft: "auto" }}>
                  <button
                    type="button"
                    aria-pressed={packSort === "old"}
                    onClick={() => setPackSort("old")}
                  >
                    Oldest first
                  </button>
                  <button
                    type="button"
                    aria-pressed={packSort === "new"}
                    onClick={() => setPackSort("new")}
                  >
                    Newest first
                  </button>
                </div>
              </div>

              {/* Area Grouped Cards */}
              <div className="stack" id="ord-pl">
                {areaGroups.map((grp) => (
                  <div key={grp.area} className="card">
                    <div className="hd" style={{ marginBottom: 8 }}>
                      <h2 style={{ fontSize: 17 }}>{grp.area}</h2>
                      <span className="muted small">{grp.orders.length} orders</span>
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
                            {paid ? "Paid" : "Cash on delivery"}
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
                            Slip
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
                  <h2>Pull from stock</h2>
                  <p>One total for all waiting orders.</p>
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
                  Share as image
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadOrdersExcel([], stockPicks, "stock-pull")}
                >
                  Excel
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
            style={{ width: "min(520px, calc(100vw - 32px))" }}
            onSubmit={handleSaveNewOrder}
          >
            <h2>New order</h2>
            <p className="muted">For phone or walk-in orders.</p>

            <div className="field">
              <label htmlFor="noc">Customer name</label>
              <input
                id="noc"
                type="text"
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Priya Sharma"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="nop">WhatsApp number</label>
              <input
                id="nop"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                required
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
