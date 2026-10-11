"use client";

import { Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { getOrderPricing } from "@/lib/order-pricing";

export type ExportableOrderRow = {
  id: string;
  orderRef: string;
  createdAt: string;
  status: string;
  isPaid: boolean;
  /** PAID, COD · COLLECT CASH, NOT PAID… (lib/payment-state slipPay); falls back to PAID / TO COLLECT. */
  payLabel?: string;
  /** Money the delivery person collects; falls back to the total when not paid. */
  collect?: number;
  customerName: string;
  customerPhone: string;
  area: string;
  address: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  currency: string;
  note: string;
};

const payText = (o: ExportableOrderRow) => o.payLabel ?? (o.isPaid ? "PAID" : "TO COLLECT");
const collectOf = (o: ExportableOrderRow, total: number) => o.collect ?? (o.isPaid ? 0 : total);

export type ExportablePickItem = {
  name: string;
  quantity: number;
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Downloads an Excel-compatible .xls file (UTF-8 HTML workbook with styled headers & columns). */
export function downloadOrdersExcel(
  orders: ExportableOrderRow[],
  picks: ExportablePickItem[],
  filenamePrefix = "orders",
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const rowsHtml = orders
    .map((o) => {
      const itemsSummary = o.items.map((i) => `${i.quantity} x ${i.name}`).join(", ");
      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
      const pricing = getOrderPricing(o.items, o.total, { applyDefaultWhenEqual: true });
      return `<tr>
        <td style="font-family:monospace;font-weight:bold;">${escapeHtml(o.orderRef)}</td>
        <td>${escapeHtml(o.createdAt)}</td>
        <td>${escapeHtml(o.status)}</td>
        <td style="color:${o.isPaid ? "#0c6b51" : "#b45309"};font-weight:bold;">${payText(o)}</td>
        <td>${escapeHtml(o.customerName)}</td>
        <td style="mso-number-format:'\\@';">${escapeHtml(o.customerPhone)}</td>
        <td><b>${escapeHtml(o.area || "Area not noted")}</b></td>
        <td>${escapeHtml(o.address || "-")}</td>
        <td>${escapeHtml(itemsSummary)}</td>
        <td style="text-align:right;">${totalQty}</td>
        <td style="text-align:right;">${pricing.subtotal}</td>
        <td style="text-align:right;">${pricing.shipping}</td>
        <td style="text-align:right;font-weight:bold;">${pricing.total}</td>
        <td style="text-align:right;color:${o.isPaid ? "#667085" : "#b45309"};font-weight:bold;">${collectOf(o, pricing.total)}</td>
        <td>${escapeHtml(o.note || "")}</td>
      </tr>`;
    })
    .join("");

  const pickHtml = picks.length
    ? `<h3>Stock Pick List Summary</h3>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;margin-bottom:20px;font-family:sans-serif;font-size:12px;">
        <thead>
          <tr style="background:#0c6b51;color:#ffffff;">
            <th align="left">Product / Item</th>
            <th align="right">Total Quantity to Pick</th>
          </tr>
        </thead>
        <tbody>
          ${picks
            .map(
              (p) =>
                `<tr><td>${escapeHtml(p.name)}</td><td align="right" style="font-weight:bold;">${p.quantity}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`
    : "";

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8" />
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Orders</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    </head>
    <body style="font-family:sans-serif;font-size:12px;">
      <h2>Orders &amp; Delivery Sheet (${dateStr})</h2>
      ${pickHtml}
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:12px;">
        <thead>
          <tr style="background:#101828;color:#ffffff;">
            <th>Order #</th>
            <th>Date</th>
            <th>Status</th>
            <th>Payment</th>
            <th>Customer Name</th>
            <th>Phone</th>
            <th>Area</th>
            <th>Full Delivery Address</th>
            <th>Items</th>
            <th>Total Qty</th>
            <th>Subtotal (INR)</th>
            <th>Shipping (INR)</th>
            <th>Final Total (INR)</th>
            <th>Amount To Collect (INR)</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </body>
  </html>`;

  const blob = new Blob(["\uFEFF", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${dateStr}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Downloads a clean UTF-8 CSV file (with BOM for Excel / Google Sheets). */
export function downloadOrdersCsv(
  orders: ExportableOrderRow[],
  filenamePrefix = "orders",
) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const q = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Order #",
    "Date",
    "Status",
    "Payment",
    "Customer Name",
    "Phone",
    "Area",
    "Full Delivery Address",
    "Items",
    "Total Qty",
    "Subtotal (INR)",
    "Shipping (INR)",
    "Final Total (INR)",
    "To Collect (INR)",
    "Notes",
  ].join(",");

  const lines = orders.map((o) => {
    const itemsSummary = o.items.map((i) => `${i.quantity} x ${i.name}`).join(", ");
    const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
    const pricing = getOrderPricing(o.items, o.total, { applyDefaultWhenEqual: true });
    return [
      q(o.orderRef),
      q(o.createdAt),
      q(o.status),
      q(payText(o)),
      q(o.customerName),
      q(o.customerPhone),
      q(o.area || "Area not noted"),
      q(o.address || ""),
      q(itemsSummary),
      totalQty,
      pricing.subtotal,
      pricing.shipping,
      pricing.total,
      collectOf(o, pricing.total),
      q(o.note || ""),
    ].join(",");
  });

  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Renders a high-DPI PNG image of a single order slip or the full packing list for sharing on WhatsApp. */
export function downloadOrdersImage(
  orders: ExportableOrderRow[],
  picks: ExportablePickItem[],
  title = "Packing & Delivery List",
  filenamePrefix = "packing-list",
) {
  const dpr = 2;
  const width = 920;
  const pad = 32;

  // Measure canvas height first using an offscreen context
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) return;

  mctx.font = "500 14px system-ui, -apple-system, sans-serif";
  const cardWidth = width - pad * 2;
  const innerWidth = cardWidth - 36;

  // Calculate height for pick list
  const pickRows = Math.ceil(picks.length / 2);
  const pickSectionHeight = picks.length > 0 ? 76 + pickRows * 32 + 24 : 0;

  // Calculate each order slip height
  const orderMeasure = orders.map((o) => {
    const addrText = o.address || o.area || "No delivery address noted";
    const addrLines = wrapCanvasText(mctx, `Address: ${addrText}`, innerWidth - 20);
    const itemLines: string[] = [];
    for (const item of o.items) {
      const wrapped = wrapCanvasText(
        mctx,
        `[ ]  ${item.quantity} × ${item.name}`,
        innerWidth - 20,
      );
      itemLines.push(...wrapped);
    }
    const h = 76 + addrLines.length * 20 + 16 + itemLines.length * 22 + 44;
    return { o, addrLines, itemLines, h };
  });

  const totalHeight =
    pad +
    84 + // Header banner
    pickSectionHeight +
    orderMeasure.reduce((sum, m) => sum + m.h + 16, 0) +
    pad;

  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = totalHeight * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#f6f7f4";
  ctx.fillRect(0, 0, width, totalHeight);

  // Header Banner
  let y = pad;
  ctx.fillStyle = "#0c6b51";
  ctx.beginPath();
  ctx.roundRect(pad, y, cardWidth, 68, 12);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(title, pad + 20, y + 30);

  const toCollect = orders.reduce((s, o) => s + collectOf(o, o.total), 0);
  const subtitle = `${orders.length} order${orders.length === 1 ? "" : "s"} · To collect: ₹${toCollect.toLocaleString("en-IN")} · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  ctx.fillStyle = "#d1fae5";
  ctx.font = "500 13px system-ui, -apple-system, sans-serif";
  ctx.fillText(subtitle, pad + 20, y + 52);

  y += 84;

  // Pick list box
  if (picks.length > 0) {
    const boxH = 56 + pickRows * 32 + 16;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d9dfd8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad, y, cardWidth, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0c6b51";
    ctx.font = "700 15px system-ui, -apple-system, sans-serif";
    ctx.fillText("STOCK PICK LIST (TOTAL ITEMS TO PACK)", pad + 18, y + 28);

    ctx.strokeStyle = "#e6ebe5";
    ctx.beginPath();
    ctx.moveTo(pad + 18, y + 40);
    ctx.lineTo(pad + cardWidth - 18, y + 40);
    ctx.stroke();

    const colW = (cardWidth - 48) / 2;
    picks.forEach((p, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = pad + 18 + col * (colW + 12);
      const py = y + 64 + row * 32;

      ctx.fillStyle = "#101828";
      ctx.font = "500 13px system-ui, -apple-system, sans-serif";
      const label = p.name.length > 36 ? `${p.name.slice(0, 34)}…` : p.name;
      ctx.fillText(label, px, py);

      ctx.fillStyle = "#0c6b51";
      ctx.font = "700 13px system-ui, -apple-system, sans-serif";
      const qtyStr = `× ${p.quantity}`;
      const qw = ctx.measureText(qtyStr).width;
      ctx.fillText(qtyStr, px + colW - qw - 6, py);
    });

    y += boxH + 20;
  }

  // Individual Order Cards
  for (const { o, addrLines, itemLines, h } of orderMeasure) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d9dfd8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad, y, cardWidth, h, 12);
    ctx.fill();
    ctx.stroke();

    // Top accent bar
    ctx.fillStyle = o.isPaid ? "#167d63" : "#b7791f";
    ctx.fillRect(pad, y, cardWidth, 4);

    // Order Ref + Customer Name + Phone
    ctx.fillStyle = "#101828";
    ctx.font = "700 16px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${o.orderRef}  ·  ${o.customerName}`, pad + 18, y + 28);

    ctx.fillStyle = "#475467";
    ctx.font = "500 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${o.customerPhone}  ·  Area: ${o.area || "Not noted"}`, pad + 18, y + 48);

    // Paid / To Collect pill on right
    const badgeText = o.isPaid
      ? `PAID · ₹${o.total.toLocaleString("en-IN")}`
      : `${payText(o)} ₹${collectOf(o, o.total).toLocaleString("en-IN")}`;
    ctx.font = "700 12px system-ui, -apple-system, sans-serif";
    const bw = ctx.measureText(badgeText).width + 20;
    ctx.fillStyle = o.isPaid ? "#dcfce7" : "#fef3c7";
    ctx.beginPath();
    ctx.roundRect(pad + cardWidth - bw - 18, y + 16, bw, 26, 13);
    ctx.fill();
    ctx.fillStyle = o.isPaid ? "#0c6b51" : "#b45309";
    ctx.fillText(badgeText, pad + cardWidth - bw - 8, y + 33);

    // Address box
    let cy = y + 64;
    const addrBoxH = addrLines.length * 20 + 12;
    ctx.fillStyle = "#f1f5f1";
    ctx.beginPath();
    ctx.roundRect(pad + 18, cy, innerWidth, addrBoxH, 8);
    ctx.fill();

    ctx.fillStyle = "#1d2939";
    ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    addrLines.forEach((line, idx) => {
      ctx.fillText(line, pad + 28, cy + 20 + idx * 20);
    });

    cy += addrBoxH + 16;

    // Items list
    ctx.fillStyle = "#101828";
    ctx.font = "500 14px system-ui, -apple-system, sans-serif";
    itemLines.forEach((line, idx) => {
      ctx.fillText(line, pad + 24, cy + 12 + idx * 22);
    });

    cy += itemLines.length * 22 + 12;

    // Footer line
    const pricing = getOrderPricing(o.items, o.total, { applyDefaultWhenEqual: true });
    ctx.fillStyle = "#667085";
    ctx.font = "500 12px system-ui, -apple-system, sans-serif";
    ctx.fillText(`Placed: ${o.createdAt}`, pad + 18, cy + 14);

    ctx.fillStyle = "#101828";
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    const totalLabel =
      pricing.shipping > 0
        ? `Items: ₹${pricing.subtotal.toLocaleString("en-IN")} + Ship: ₹${pricing.shipping} = Total: ₹${pricing.total.toLocaleString("en-IN")}`
        : `Total: ₹${pricing.total.toLocaleString("en-IN")}`;
    const tw = ctx.measureText(totalLabel).width;
    ctx.fillText(totalLabel, pad + cardWidth - tw - 18, cy + 14);

    y += h + 16;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

/** Opens a dedicated, clean printable PDF window and triggers Save as PDF / Print. */
export function openPrintablePdfWindow(
  orders: ExportableOrderRow[],
  picks: ExportablePickItem[],
  title = "Packing & Delivery List",
) {
  const toCollect = orders.reduce((s, o) => s + collectOf(o, getOrderPricing(o.items, o.total, { applyDefaultWhenEqual: true }).total), 0);
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pickSection = picks.length
    ? `<div class="pick-card">
        <h2>Stock Pick List (${picks.length} products)</h2>
        <div class="pick-grid">
          ${picks
            .map(
              (p) =>
                `<div class="pick-item"><span>${escapeHtml(p.name)}</span><b>× ${p.quantity}</b></div>`,
            )
            .join("")}
        </div>
      </div>`
    : "";

  const slipsHtml = orders
    .map((o) => {
      const pricing = getOrderPricing(o.items, o.total, { applyDefaultWhenEqual: true });
      return `<div class="slip">
        <div class="slip-head">
          <div>
            <div class="cust-name">${escapeHtml(o.customerName)}</div>
            <div class="cust-phone">${escapeHtml(o.customerPhone)} · <b>${escapeHtml(o.area || "Area not noted")}</b></div>
          </div>
          <div class="right-badges">
            <span class="ref">${escapeHtml(o.orderRef)}</span>
            <span class="pay ${o.isPaid ? "paid" : "collect"}">${payText(o)}</span>
          </div>
        </div>
        <div class="address-box">
          <b>Delivery Address:</b> ${escapeHtml(o.address || o.area || "Address not entered")}
        </div>
        <ul class="items">
          ${o.items
            .map(
              (i) =>
                `<li><span class="chk"></span> <b>${i.quantity} ×</b> ${escapeHtml(i.name)}</li>`,
            )
            .join("")}
        </ul>
        <div class="slip-foot">
          <span>${escapeHtml(o.createdAt)}</span>
          <b>${
            pricing.shipping > 0
              ? `Subtotal: ₹${pricing.subtotal.toLocaleString("en-IN")} + Shipping: ₹${pricing.shipping} = ₹${pricing.total.toLocaleString("en-IN")}`
              : `Total: ₹${pricing.total.toLocaleString("en-IN")}`
          }</b>
        </div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} - PDF</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, sans-serif; color: #101828; margin: 0; padding: 20px; font-size: 12px; }
      .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0c6b51; padding-bottom: 10px; margin-bottom: 16px; }
      .header h1 { margin: 0; font-size: 20px; color: #0c6b51; }
      .header p { margin: 4px 0 0; color: #475467; font-size: 12px; }
      .pick-card { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; page-break-inside: avoid; }
      .pick-card h2 { margin: 0 0 10px; font-size: 14px; color: #0c6b51; }
      .pick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; }
      .pick-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #e4e7ec; padding: 4px 0; }
      .slips-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .slip { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; page-break-inside: avoid; break-inside: avoid; }
      .slip-head { display: flex; justify-content: space-between; gap: 8px; }
      .cust-name { font-size: 14px; font-weight: 700; }
      .cust-phone { color: #475467; margin-top: 2px; }
      .right-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
      .ref { font-family: monospace; font-weight: 700; background: #f2f4f7; padding: 2px 6px; border-radius: 4px; }
      .pay { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; }
      .pay.paid { background: #dcfce7; color: #0c6b51; }
      .pay.collect { background: #fef3c7; color: #b45309; }
      .address-box { margin-top: 8px; padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11.5px; line-height: 1.35; }
      .items { list-style: none; padding: 8px; margin: 8px 0; background: #f9fafb; border-radius: 6px; }
      .items li { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
      .chk { display: inline-block; width: 11px; height: 11px; border: 1.5px solid #667085; border-radius: 2px; }
      .slip-foot { display: flex; justify-content: space-between; border-top: 1px solid #eaecf0; padding-top: 6px; color: #475467; }
      .slip-foot b { color: #101828; font-size: 13px; }
      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${orders.length} order${orders.length === 1 ? "" : "s"} · Amount to collect: <b>₹${toCollect.toLocaleString("en-IN")}</b></p>
      </div>
      <div>${escapeHtml(dateStr)}</div>
    </div>
    ${pickSection}
    <div class="slips-grid">${slipsHtml}</div>
    <script>
      window.addEventListener("load", function() {
        setTimeout(function() { window.print(); }, 200);
      });
    </script>
  </body>
  </html>`;

  const w = window.open("", "_blank", "width=960,height=800");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  } else {
    window.print();
  }
}

/**
 * Complete Print & Export toolbar for Packing List and Orders pages:
 * - Print / Save as PDF
 * - Download as Image (.png) for WhatsApp sharing
 * - Download as Excel (.xls) & CSV
 */
export function PrintButton({
  orders = [],
  picks = [],
  title = "Packing & Delivery List",
  filenamePrefix = "packing-list",
}: {
  orders?: ExportableOrderRow[];
  picks?: ExportablePickItem[];
  title?: string;
  filenamePrefix?: string;
}) {
  const [busy, setBusy] = useState<"pdf" | "img" | "xls" | "csv" | null>(null);

  const handlePdf = () => {
    setBusy("pdf");
    try {
      if (orders.length > 0) {
        openPrintablePdfWindow(orders, picks, title);
      } else {
        window.print();
      }
    } finally {
      setTimeout(() => setBusy(null), 400);
    }
  };

  const handleImage = () => {
    if (!orders.length) return;
    setBusy("img");
    try {
      downloadOrdersImage(orders, picks, title, filenamePrefix);
    } finally {
      setTimeout(() => setBusy(null), 400);
    }
  };

  const handleExcel = () => {
    if (!orders.length) return;
    setBusy("xls");
    try {
      downloadOrdersExcel(orders, picks, filenamePrefix);
    } finally {
      setTimeout(() => setBusy(null), 300);
    }
  };

  const handleCsv = () => {
    if (!orders.length) return;
    setBusy("csv");
    try {
      downloadOrdersCsv(orders, filenamePrefix);
    } finally {
      setTimeout(() => setBusy(null), 300);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
      <Button
        variant="primary"
        size="sm"
        onClick={handlePdf}
        disabled={busy !== null}
        title="Print or save as PDF"
      >
        {busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
        <span>Print / PDF</span>
      </Button>

      {orders.length > 0 && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImage}
            disabled={busy !== null}
            title="Download high-resolution PNG image to share on WhatsApp"
          >
            {busy === "img" ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            <span>Image (PNG)</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExcel}
            disabled={busy !== null}
            title="Download formatted Excel (.xls) sheet"
          >
            {busy === "xls" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            <span>Excel (.xls)</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCsv}
            disabled={busy !== null}
            title="Download raw CSV spreadsheet"
          >
            {busy === "csv" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="max-sm:sr-only">CSV</span>
          </Button>
        </>
      )}
    </div>
  );
}

/** Per-slip quick download button to save a single order's delivery slip as a PNG or PDF. */
export function SingleSlipExportButtons({ order }: { order: ExportableOrderRow }) {
  return (
    <div className="flex items-center gap-1 print:hidden">
      <button
        type="button"
        onClick={() =>
          downloadOrdersImage(
            [order],
            [],
            `Delivery Slip · ${order.orderRef}`,
            `slip-${order.orderRef.toLowerCase()}`,
          )
        }
        title={`Download ${order.orderRef} slip as PNG image for WhatsApp`}
        className="inline-flex items-center gap-1 rounded-control bg-panel px-2 py-1 text-2xs font-semibold text-ink-2 ring-1 ring-line transition hover:bg-sunken hover:text-ink"
      >
        <ImageIcon aria-hidden className="size-3" />
        <span>PNG</span>
      </button>
      <button
        type="button"
        onClick={() =>
          openPrintablePdfWindow([order], [], `Delivery Slip · ${order.orderRef}`)
        }
        title={`Print or save ${order.orderRef} slip as PDF`}
        className="inline-flex items-center gap-1 rounded-control bg-panel px-2 py-1 text-2xs font-semibold text-ink-2 ring-1 ring-line transition hover:bg-sunken hover:text-ink"
      >
        <FileText aria-hidden className="size-3" />
        <span>PDF</span>
      </button>
    </div>
  );
}
