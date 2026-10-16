"use client";

import { useState } from "react";
import { AlertCircle, Clock, Hourglass, Search, ShoppingBag } from "@/components/icons";
import { Stat } from "@/components/ui";
import Link from "@/components/intent-link";
import { sendCatalogue } from "../../actions/catalog";
import { requestPayment } from "../../actions/orders";
import { handleRepliesOf, setReplyHandled } from "../../actions/replies";
import { inr } from "../../portal-format";
import { PAction, Pill, Seg, type PillTone } from "../../portal-ui";

/** One open conversation on the board (dates as epoch ms so they cross from the server). */
export type BoardItem = {
  customerId: string;
  name: string;
  latestReplyId: string;
  lastText: string;
  lastKind: string;
  openCount: number;
  waitingSinceMs: number;
  windowLeftH: number;
  cart: { id: string; ref: string; total: number; paymentRequested: boolean } | null;
  paidOrders: number;
  lifetimeValue: number;
  buyingIntent: boolean;
  lane: "money" | "buying" | "regular" | "other";
};

const GROUPS: { k: BoardItem["lane"]; h: string; sub: string; pill: PillTone }[] = [
  { k: "money", h: "Money waiting", sub: "They have an open cart. Reply before the free window closes.", pill: "bad" },
  { k: "buying", h: "Wants to buy", sub: "They asked about price, stock or delivery.", pill: "warn" },
  { k: "regular", h: "Past buyers", sub: "Customers who already bought. Keep them warm.", pill: "info" },
  { k: "other", h: "Questions and new", sub: "New numbers and general questions.", pill: "mute" },
];

function waitText(mins: number) {
  if (mins < 60) return `${mins} m waiting`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} m` : ""} waiting`;
  return `${Math.floor(mins / 1440)} days waiting`;
}
function windowText(h: number) {
  if (h <= 0) return "window closed, a message will cost";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} m of free window left`;
  return `${Math.floor(h)} h left`;
}
function detail(it: BoardItem) {
  if (it.cart) return `Cart ${inr(it.cart.total)} · ${windowText(it.windowLeftH)}${it.cart.paymentRequested ? " · pay link sent" : ""}`;
  const quote = `${it.lastKind === "media" ? "📎 " : it.lastKind === "order" ? "🛒 " : ""}“${it.lastText}”`;
  if (it.paidOrders) return `Bought ${it.paidOrders} time${it.paidOrders === 1 ? "" : "s"} · ${quote}`;
  return quote;
}

function Row({ it, lane, nowMs, canOperate }: { it: BoardItem; lane: BoardItem["lane"]; nowMs: number; canOperate: boolean }) {
  const mins = Math.max(0, Math.round((nowMs - it.waitingSinceMs) / 60000));
  return (
    <div className="row">
      <div className="grow">
        <Link className="t" href={`/dashboard/customers/${it.customerId}`} style={{ textDecoration: "none" }}>
          {it.name}
        </Link>
        <div className="muted small">{detail(it)}</div>
      </div>
      <span className="muted small">{waitText(mins)}</span>
      <Link className={`btn sm${lane === "money" ? " primary" : ""}`} href={`/dashboard/replies?r=${it.customerId}`}>
        Reply
      </Link>
      {canOperate && it.cart && !it.cart.paymentRequested && (
        <PAction action={requestPayment.bind(null, it.cart.id)} confirm={`Send ${it.name} the WhatsApp “Review and pay” message for ${it.cart.ref}?`}>
          Pay link
        </PAction>
      )}
      {canOperate && !it.cart && it.buyingIntent && it.windowLeftH > 0 && (
        <PAction action={sendCatalogue.bind(null, it.customerId)} title="Send the WhatsApp catalogue (free inside the 24-hour window)">
          Catalogue
        </PAction>
      )}
      {canOperate && (
        <PAction action={setReplyHandled.bind(null, it.latestReplyId, true)} className="sm ghost" title="Mark this conversation handled">
          Done
        </PAction>
      )}
    </div>
  );
}

export function PriorityBoard({ items, nowMs, canOperate }: { items: BoardItem[]; nowMs: number; canOperate: boolean }) {
  const [open, setOpen] = useState<BoardItem["lane"] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("wait");

  const byLane = (k: BoardItem["lane"]) => items.filter((i) => i.lane === k);
  const cartValue = items.reduce((n, i) => n + (i.cart?.total ?? 0), 0);
  const closing = items.filter((i) => i.windowLeftH > 0 && i.windowLeftH < 3).length;
  const closed = items.filter((i) => i.windowLeftH <= 0).length;
  const oldest = items.reduce((m, i) => Math.min(m, i.waitingSinceMs), Infinity);
  const oldestMins = Number.isFinite(oldest) ? Math.max(0, Math.round((nowMs - oldest) / 60000)) : 0;
  const longest = !Number.isFinite(oldest) ? "—" : oldestMins < 60 ? `${oldestMins} m` : oldestMins < 2880 ? `${Math.floor(oldestMins / 60)} h ${oldestMins % 60} m` : `${Math.floor(oldestMins / 1440)} days`;

  const stats = (
    <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
      <Stat
        label="Value in open carts"
        value={inr(cartValue)}
        sub="Open checkout value"
        icon={<ShoppingBag className="size-4" />}
        tone="brand"
      />
      <Stat
        label="Closing within 3 hours"
        value={closing}
        sub={closing > 0 ? "Free reply window ends soon" : "Windows healthy"}
        icon={<Clock className="size-4" />}
        tone={closing > 0 ? "rose" : "brand"}
      />
      <Stat
        label="Window already closed"
        value={closed}
        sub="Needs template to reply"
        icon={<AlertCircle className="size-4" />}
        tone="amber"
      />
      <Stat
        label="Longest wait"
        value={longest}
        sub="Customer waiting time"
        icon={<Hourglass className="size-4" />}
        tone="info"
      />
    </div>
  );

  if (items.length === 0) {
    return (
      <>
        {stats}
        <section className="card">
          <h2>All caught up</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            No open conversations. New customer messages will land here, most valuable first.
          </p>
        </section>
      </>
    );
  }

  const g = GROUPS.find((x) => x.k === open);
  if (g) {
    const all = byLane(g.k);
    const ql = q.trim().toLowerCase();
    const list = all
      .filter((r) => !ql || `${r.name} ${r.lastText}`.toLowerCase().includes(ql))
      .sort((a, b) => (sort === "val" ? (b.cart?.total ?? 0) - (a.cart?.total ?? 0) : a.waitingSinceMs - b.waitingSinceMs));
    return (
      <>
        {stats}
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => setOpen(null)}>
            ‹ Back to priority
          </button>
          <div className="search" style={{ marginLeft: 8 }}>
            <Search aria-hidden />
            <input type="search" placeholder="Search name or message" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Seg
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { id: "wait", label: "Longest wait first" },
              { id: "val", label: "Biggest cart first" },
            ]}
          />
          {canOperate && (
            <PAction action={handleRepliesOf.bind(null, all.map((r) => r.latestReplyId))} style={{ marginLeft: "auto" }} confirm={`Mark all ${all.length} chats in “${g.h}” as handled?`}>
              Mark all as handled
            </PAction>
          )}
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>{g.h}</h2>
              <p>{g.sub}</p>
            </div>
            <Pill tone={g.pill}>{all.length} waiting for a reply</Pill>
          </div>
          <div className="list">
            {list.map((it) => (
              <Row key={it.customerId} it={it} lane={g.k} nowMs={nowMs} canOperate={canOperate} />
            ))}
            {list.length === 0 && (
              <p className="muted" style={{ padding: "14px 0" }}>
                Nothing matches.
              </p>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {stats}
      <div className="grid g2">
        {GROUPS.map((grp) => {
          const rows = byLane(grp.k).sort((a, b) => a.waitingSinceMs - b.waitingSinceMs);
          return (
            <div key={grp.k} className="card">
              <div className="hd">
                <h2>{grp.h}</h2>
                <Pill tone={grp.pill}>
                  {rows.length} chat{rows.length === 1 ? "" : "s"}
                </Pill>
              </div>
              <div className="list">
                {rows.slice(0, 2).map((it) => (
                  <Row key={it.customerId} it={it} lane={grp.k} nowMs={nowMs} canOperate={canOperate} />
                ))}
                {rows.length === 0 && <p className="muted small">Nothing here.</p>}
              </div>
              {rows.length > 2 ? (
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", marginTop: 12 }}
                  onClick={() => {
                    setOpen(grp.k);
                    setQ("");
                  }}
                >
                  Show all {rows.length} ›
                </button>
              ) : rows.length > 0 ? (
                <p className="muted small" style={{ marginTop: 12 }}>
                  That is everyone in this group.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
