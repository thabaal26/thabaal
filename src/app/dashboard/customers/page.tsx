import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { PickClientNotice } from "@/components/ui";
import { readFields } from "@/lib/custom-fields";
import { customersData, type CustomerRow } from "@/lib/customers-data";
import { db } from "@/lib/db";
import { homeCityOf, regionsFor } from "@/lib/regions";
import { refillForecast } from "@/lib/refill-forecast";
import { getScope, owned } from "@/lib/session";
import { inr } from "../portal-format";
import { PortalPage } from "../portal-ui";
import { CopyText } from "./copy-text";
import { CustomerActions, PendingCustomersBanner } from "./customer-tools";
import { CustomersTabs, CUSTOMERS_SUB, CUSTOMERS_SUB_TA } from "./customers-tabs";
import { CustomerTable, LoyaltyPanel } from "./customers-board";
import { GroupCampaign } from "./group-campaign";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

/** Customers (portal design): all customers, groups to reach, loyalty. Refills is its own page. */
export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const sp = await searchParams;
  const tab = sp.tab === "groups" || sp.tag === "lapsed" ? "groups" : sp.tab === "loyalty" || sp.tag === "loyalty" ? "loyalty" : "all";
  const scope = await getScope();

  if (!scope.clientId)
    return (
      <PortalPage title="Customers" titleTa="வாடிக்கையாளர்" sub={CUSTOMERS_SUB} subTa={CUSTOMERS_SUB_TA}>
        <CustomersTabs active={tab} />
        <PickClientNotice what="customers" />
      </PortalPage>
    );
  const clientId = scope.clientId;

  const [{ customers: rows, platinumCut, goldCut }, client, pendingRows] = await Promise.all([
    customersData(clientId, { clientName: scope.clientName }),
    db.client.findUnique({ where: { id: clientId }, select: { homeCity: true, customFields: true } }),
    scope.canManage
      ? db.pendingCustomer.findMany({
          where: owned(scope),
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, rawPhone: true, location: true, payment: true, items: true, notes: true, page: true },
        })
      : Promise.resolve([]),
  ]);
  const regions = regionsFor(homeCityOf(client));

  let body: React.ReactNode;

  if (tab === "groups") {
    const f = await refillForecast(clientId, new Date());
    const dueIds = new Set(f.due.filter((d) => d.daysLeft <= 7).map((d) => d.customerId));
    const sum = (xs: CustomerRow[]) => xs.reduce((n, c) => n + c.cart, 0);
    const unpaid = rows.filter((c) => c.cart > 0);
    const groups: { title: string; tag: string; list: CustomerRow[]; money?: number; what: string; why: string; steps: string[]; msg: string; href: string }[] = [
      {
        title: "Unpaid cart",
        tag: "unpaid-cart",
        list: unpaid,
        money: sum(unpaid),
        what: "They asked for items but did not pay.",
        why: "Customers get busy or unsure about delivery.",
        steps: ["Send a pay link again", "Offer free delivery or small credit", "Call the biggest carts"],
        msg: "Hi! Your cart is saved. Complete your order today and we will deliver soon.",
        href: "/dashboard/revenue",
      },
      {
        title: "Refill due",
        tag: "refill-due",
        list: rows.filter((c) => dueIds.has(c.id)),
        what: "They are about to run out, or already have.",
        why: "They reorder on a rhythm.",
        steps: ["Send a refill reminder", "Include the last item they bought", "Offer a one-tap reorder"],
        msg: "Hi! You may be running low. Want the same order again?",
        href: "/dashboard/refills",
      },
      {
        title: "Lapsed",
        tag: "lapsed",
        list: rows.filter((c) => c.status === "Lost"),
        what: `Not bought for much longer than usual (${f.lapsedDays}+ days or 3× their own gap).`,
        why: "They forgot, or found another shop.",
        steps: ["Send a friendly win-back", "Add a small offer", "Stop after one message"],
        msg: "We miss you! Here is a small gift on your next order.",
        href: "/dashboard/campaigns",
      },
      {
        title: "Warm, not bought",
        tag: "warm-lead",
        list: rows.filter((c) => c.orders === 0 && c.chatted),
        what: "They chatted but never ordered.",
        why: "Price or trust questions.",
        steps: ["Share the price list", "Answer their last question", "Offer a small first-order gift"],
        msg: "Hi! Here is our price list. Happy to help you choose.",
        href: "/dashboard/replies",
      },
      {
        title: "Never ordered",
        tag: "never-ordered",
        list: rows.filter((c) => c.orders === 0 && !c.chatted),
        what: "On your list, no order yet.",
        why: "They may not know what you sell.",
        steps: ["Send your catalogue", "Share a best seller", "Wait a week before the next message"],
        msg: "Welcome! See what we sell and order right here on WhatsApp.",
        href: "/dashboard/catalogue",
      },
    ];
    body = (
      <>
        <p className="muted" style={{ marginBottom: 14 }}>
          Each group has a message that is ready to send, and 3 simple steps.{" "}
          <Link className="linkb" href="/dashboard/customers/audiences">
            Your saved groups
          </Link>{" "}
          ·{" "}
          <Link className="linkb" href="/dashboard/customers/grow">
            Get more customers (QR code)
          </Link>
        </p>
        <div className="stack">
          {groups.map((g, i) => (
            <details key={g.title} className="card more" style={{ margin: 0 }} open={i === 0}>
              <summary style={{ gap: 10, flexWrap: "wrap" }}>
                <b style={{ font: "600 18px var(--display)" }}>{g.title}</b>
                <span className="pill info">
                  {g.list.length} customer{g.list.length === 1 ? "" : "s"}
                </span>
                {g.money ? <span className="pill bad">{inr(g.money)}</span> : null}
              </summary>
              <div className="grid g2" style={{ marginTop: 14 }}>
                <div>
                  <p>{g.what}</p>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    Why: {g.why}
                  </p>
                  <ol style={{ margin: "10px 0 0", paddingLeft: 20 }}>
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {g.list.length > 0 && (
                    <p className="muted small" style={{ marginTop: 10 }}>
                      {g.list
                        .slice(0, 6)
                        .map((c) => c.name)
                        .join(", ")}
                      {g.list.length > 6 ? ` and ${g.list.length - 6} more` : ""}
                    </p>
                  )}
                </div>
                <div>
                  <div className="phone">
                    <div className="bubble">{g.msg}</div>
                  </div>
                  <div className="tools" style={{ marginTop: 10 }}>
                    <CopyText text={g.msg} />
                    <Link className="btn sm" href={g.href}>
                      Open
                    </Link>
                    {scope.canManage && g.list.length > 0 && <GroupCampaign ids={g.list.map((c) => c.id)} tag={g.tag} />}
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </>
    );
  } else if (tab === "loyalty") {
    body = <LoyaltyPanel rows={rows} canManage={scope.canManage} />;
  } else {
    const total = rows.length;
    const optedOut = rows.filter((c) => c.optedOut || c.unreachable).length;
    const home = regions[0];
    const atHome = rows.filter((c) => c.region === home).length;
    const badPhones = rows.filter((c) => c.badPhone).length;
    const count = (t: string) => rows.filter((c) => c.tier === t).length;
    const countS = (t: string) => rows.filter((c) => c.status === t).length;
    body = (
      <>
        {scope.canManage && pendingRows.length > 0 && <PendingCustomersBanner rows={pendingRows} />}
        <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="l">Customers</div>
            <div className="v">{total.toLocaleString("en-IN")}</div>
          </div>
          <div className="card stat">
            <div className="l">Can receive WhatsApp</div>
            <div className="v">{(total - optedOut).toLocaleString("en-IN")}</div>
          </div>
          <div className="card stat">
            <div className="l">Opted out</div>
            <div className="v">{optedOut.toLocaleString("en-IN")}</div>
          </div>
          <div className="card stat">
            <div className="l">{home}</div>
            <div className="v">{atHome.toLocaleString("en-IN")}</div>
            <div className="d muted">{(total - atHome).toLocaleString("en-IN")} elsewhere or not noted</div>
          </div>
        </div>
        {badPhones > 0 && (
          <div className="note" style={{ marginBottom: 14 }}>
            <b>
              {badPhones} number{badPhones === 1 ? " is" : "s are"} missing or incomplete.
            </b>{" "}
            Open those customers and fix the number so they can be reached.
          </div>
        )}
        <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
          <CustomerActions
            canManage={scope.canManage}
            hasClient
            regions={regions}
            fields={readFields(client?.customFields, "customer")}
            exportHref={scope.canManage && total > 0 ? "/api/customers/export" : null}
            exportCount={total}
          />
        </div>
        <CustomerTable rows={rows} canManage={scope.canManage} />
        <details className="card more" style={{ marginTop: 14 }}>
          <summary>
            <b style={{ font: "600 17px var(--display)" }}>How tier and buying status are decided</b>
          </summary>
          <div className="grid g2" style={{ marginTop: 12 }}>
            <div>
              <h3 style={{ font: "600 15px var(--display)", marginBottom: 8 }}>Tier — how much they spend</h3>
              <div className="list">
                {[
                  ["Platinum", `Top 10% · ${inr(Number.isFinite(platinumCut) ? platinumCut : 0)}+ and 3 or more orders`, "ok"],
                  ["Gold", `Next 20% · ${inr(Number.isFinite(goldCut) ? goldCut : 0)}+`, "warn"],
                  ["Silver", "Everyone else who has bought", "mute"],
                  ["New", "First order, within 30 days", "info"],
                ].map(([t, d, tone]) => (
                  <div key={t} className="row">
                    <span className={`pill ${tone}`}>{t}</span>
                    <div className="grow muted small">{d}</div>
                    <b>{count(t)}</b>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Only confirmed or paid orders count. Worked out fresh every time you open this page.
              </p>
            </div>
            <div>
              <h3 style={{ font: "600 15px var(--display)", marginBottom: 8 }}>How they are buying — their own rhythm</h3>
              <div className="list">
                {[
                  ["Active", "Ordered within their usual gap", "ok"],
                  ["Slipping", "1.5 to 3 times their usual gap", "warn"],
                  ["Lost", "More than 3 times the gap, or 180 days", "bad"],
                ].map(([t, d, tone]) => (
                  <div key={t} className="row">
                    <span className={`pill ${tone}`}>{t}</span>
                    <div className="grow muted small">{d}</div>
                    <b>{countS(t)}</b>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Each customer is judged against their own gap between orders (30 days until they have two orders), not a fixed number of days.
              </p>
            </div>
          </div>
        </details>
      </>
    );
  }

  return (
    <PortalPage title="Customers" titleTa="வாடிக்கையாளர்" sub={CUSTOMERS_SUB} subTa={CUSTOMERS_SUB_TA}>
      <CustomersTabs active={tab} />
      {body}
    </PortalPage>
  );
}

