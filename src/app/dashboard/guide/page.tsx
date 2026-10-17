import { BarChart3, FileText, Home, IndianRupee, Megaphone, MessageCircle, Package, Settings, Tag, Users } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { PortalPage, T } from "../portal-ui";

export const metadata: Metadata = { title: "What changed" };

const PAGES = [
  { href: "/dashboard", title: "Home", icon: Home, desc: "Today at a glance: 3 things to do, key numbers, wallet, next campaign, daily brief." },
  { href: "/dashboard/replies", title: "Chats", icon: MessageCircle, desc: "Open chats, priority board, calls." },
  { href: "/dashboard/orders", title: "Orders", icon: Package, desc: "Track, pack, dispatch and deliver." },
  { href: "/dashboard/revenue", title: "Payments", icon: IndianRupee, desc: "To collect, received, cash/COD, all transactions, payment settings." },
  { href: "/dashboard/customers", title: "Customers", icon: Users, desc: "All customers, groups to reach, loyalty, refills." },
  { href: "/dashboard/catalogue", title: "Products", icon: Tag, desc: "Catalogue, how products sell, combo ideas." },
  { href: "/dashboard/campaigns", title: "Campaigns", icon: Megaphone, desc: "All, scheduled, running, completed, drafts, paused and automations." },
  { href: "/dashboard/templates", title: "Templates", icon: FileText, desc: "Meta templates with Marketing, Utility and Authentication filters." },
  { href: "/dashboard/report", title: "Reports", icon: BarChart3, desc: "Overview, campaigns, customers and products." },
  { href: "/dashboard/settings", title: "Settings", icon: Settings, desc: "Password, look, language, WhatsApp numbers, business details." },
];

const MOVES: [string, string, string?][] = [
  ["Dashboard › Overview", "Home (summary, wallet, brief, next campaign). Funnel and message activity are in Reports.", "/dashboard"],
  ["Dashboard › Customers view", "Customers › Groups to reach and Loyalty. Who and when is in Reports.", "/dashboard/customers?tab=groups"],
  ["Dashboard › Products view", "Products › How products sell.", "/dashboard/catalogue?view=demand"],
  ["Notifications and bell", "The bell at the top of every page. It opens a list with filters."],
  ["Orders", "Orders › Orders. Each order shows its stage, a timeline and one main button.", "/dashboard/orders"],
  // Packing list switched off (owner, 18 Oct 2026):
  // ["Orders › Packing list", "Orders › Packing list.", "/dashboard/orders/packing"],
  ["Refills", "Customers › Refills. The refill reminder switch is in Campaigns › Automations.", "/dashboard/refills"],
  ["Revenue and cash (Money)", "Payments › Received. Money still to come in: Payments › To collect.", "/dashboard/revenue"],
  ["WhatsApp billing", "Meta billing summary is in Settings.", "/dashboard/settings#billing"],
  ["Catalogue and Menu", "Products › Catalogue.", "/dashboard/catalogue"],
  ["Replies", "Chats › Open chats.", "/dashboard/replies"],
  ["Replies › Priority board", "Chats › Priority.", "/dashboard/replies/priority"],
  ["Calls", "Chats › Calls.", "/dashboard/calls"],
  ["Campaigns", "Campaigns. Refill reminders, win-back and STOP opt-out are in Automations.", "/dashboard/campaigns"],
  ["Message log", "Campaigns › Message log, and each campaign's View progress or View result.", "/dashboard/messages"],
  ["Templates", "Templates (its own page) with kind, status, language and format filters.", "/dashboard/templates"],
  ["Customers (directory)", "Customers › All customers.", "/dashboard/customers"],
  ["Settings", "Settings. Look, language, WhatsApp numbers and business details are here too.", "/dashboard/settings"],
  ["Sidebar and header", "One simple menu in 6 groups, with an English/தமிழ் switch on every page. Urgent counts show next to Chats and Orders."],
  ["Accessibility", "Kept on every page: skip link, labelled buttons, visible focus."],
];

const BUTTONS: [string, string, string][] = [
  ["New", "Confirm & message customer · Cash on delivery & confirm · Request payment", "The order moves to Confirmed; cash on delivery also confirms it."],
  ["Confirmed, not paid", "Request payment (UPI) · Dispatch · Cash on delivery", "A WhatsApp payment turns the order paid by itself."],
  ["Customer says they paid", "Payment received · Not received", "One tap after seeing the money in your bank or UPI app."],
  ["Paid or cash on delivery", "Dispatch & message customer", "Asks for the delivery time and person, and can send a tracking link."],
  ["Dispatched", "Delivered & thank customer · Delivered & cash collected", "Cash on delivery closes here."],
  ["Any open order", "Open chat · Call · Timeline · More: edit items, team note, record payment, refund, cancel", "Rare actions stay under More actions."],
];

/** What changed: a map from the old menu to the new pages (portal design). */
export default function GuidePage() {
  return (
    <PortalPage title="What changed" titleTa="என்ன மாறியது" sub="A map from the old menu to the new pages." subTa="பழைய மெனுவிலிருந்து புதிய பக்கங்களுக்கு வழிகாட்டி.">
      <div className="stack">
        <section>
          <h2 style={{ marginBottom: 12 }}><T>All pages</T></h2>
          <div className="grid g3">
            {PAGES.map((p) => {
              const Icon = p.icon;
              return (
                <Link key={p.href} className="todo" href={p.href} style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", font: "600 18px var(--display)" }}>
                    <Icon aria-hidden className="ic" /> {p.title}
                  </span>
                  <span className="muted small">{p.desc}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="hd">
            <div>
              <h2>Where did the old sections go?</h2>
              <p>The long menu became 10 pages. Nothing was removed.</p>
            </div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Old place</th>
                  <th>Now</th>
                </tr>
              </thead>
              <tbody>
                {MOVES.map(([old, now, href]) => (
                  <tr key={old}>
                    <td>
                      <b>{old}</b>
                    </td>
                    <td>
                      {now}
                      {href && (
                        <>
                          {" "}
                          <Link className="linkb" href={href}>
                            Open
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="hd">
            <div>
              <h2><T>Buttons on each order</T></h2>
              <p><T ta="உரிமையாளர் பார்ப்பது, நடக்கும் வரிசையில்.">What the owner sees, in the order things happen.</T></p>
            </div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Order is…</th>
                  <th>Buttons</th>
                  <th>What happens</th>
                </tr>
              </thead>
              <tbody>
                {BUTTONS.map(([state, buttons, what]) => (
                  <tr key={state}>
                    <td>
                      <b>{state}</b>
                    </td>
                    <td>{buttons}</td>
                    <td className="muted">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}><T>What got simpler</T></h2>
          <ul>
            <li>Menu: 10 pages in 6 groups</li>
            <li>Each page has one job, with tabs for the rest</li>
            <li>One yellow button for the main action. Red only for problems, green only for “done”</li>
            <li>Rare actions (edit, cancel, undo) sit under “More”</li>
            <li>Costs, charts and Meta rules moved out of the home page</li>
          </ul>
        </section>
      </div>
    </PortalPage>
  );
}
