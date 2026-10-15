import { BarChart3, Home, IndianRupee, Megaphone, MessageCircle, Package, Settings, Tag, Users } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";

export const metadata: Metadata = {
  title: "What changed in this menu · Thabaal",
  description: "A map from the old menu to the new 9-page architecture.",
};

const PAGES = [
  {
    href: "/dashboard",
    title: "Home",
    icon: Home,
    desc: "Today at a glance: 3 things to do, key numbers, wallet, next campaign, daily brief.",
  },
  {
    href: "/dashboard/replies",
    title: "Chats",
    icon: MessageCircle,
    desc: "Open chats, priority board, calls.",
  },
  {
    href: "/dashboard/orders",
    title: "Orders",
    icon: Package,
    desc: "Every order, packing list, new order.",
  },
  {
    href: "/dashboard/revenue",
    title: "Money",
    icon: IndianRupee,
    desc: "Cash in, follow-ups, WhatsApp costs and wallet.",
  },
  {
    href: "/dashboard/customers",
    title: "Customers",
    icon: Users,
    desc: "All customers, groups to reach, loyalty, refills.",
  },
  {
    href: "/dashboard/catalogue",
    title: "Products",
    icon: Tag,
    desc: "Catalogue and how products sell.",
  },
  {
    href: "/dashboard/campaigns",
    title: "Campaigns",
    icon: Megaphone,
    desc: "Campaigns, templates, automatic messages, message log.",
  },
  {
    href: "/dashboard/report",
    title: "Reports",
    icon: BarChart3,
    desc: "This week, message-to-sale funnel, carts, who and when.",
  },
  {
    href: "/dashboard/settings",
    title: "Settings",
    icon: Settings,
    desc: "Password, look, WhatsApp numbers, business details.",
  },
];

const MAPPING = [
  {
    old: "Dashboard › Overview",
    now: "Home (summary, wallet, brief, next campaign). Costs went to Money › WhatsApp costs. Funnel and message activity went to Reports.",
  },
  {
    old: "Dashboard › Customers view",
    now: "Customers › Groups to reach and Loyalty. Area, what customers buy and best time went to Reports › Who and when.",
  },
  {
    old: "Dashboard › Products view",
    now: "Products › How products sell.",
  },
  {
    old: "Dashboard › Carts view",
    now: "Reports › Carts.",
  },
  {
    old: "Notifications and bell",
    now: "The bell at the top of every page. It opens a list with filters.",
  },
  {
    old: "Orders",
    now: "Orders › Orders.",
  },
  {
    old: "Orders › Packing list",
    now: "Orders › Packing list.",
  },
  {
    old: "Refills",
    now: "Customers › Refills. Refill reminder switch is in Campaigns › Automatic messages.",
  },
  {
    old: "Revenue and cash",
    now: "Money › Cash in.",
  },
  {
    old: "Catalogue and Menu",
    now: "Products › Catalogue.",
  },
  {
    old: "Replies",
    now: "Chats › Open chats.",
  },
  {
    old: "Replies › Priority board",
    now: "Chats › Priority.",
  },
  {
    old: "Calls",
    now: "Chats › Calls.",
  },
  {
    old: "Campaigns",
    now: "Campaigns › Campaigns. Win-back and STOP opt-out are in Automatic messages.",
  },
  {
    old: "Templates",
    now: "Campaigns › Message templates.",
  },
  {
    old: "Customers (directory)",
    now: "Customers › All customers.",
  },
  {
    old: "Weekly report",
    now: "Reports › This week.",
  },
  {
    old: "Message log",
    now: "Campaigns › Message log.",
  },
  {
    old: "Settings",
    now: "Settings. Theme, WhatsApp numbers and business details moved here too.",
  },
  {
    old: "Sidebar and header",
    now: "One simple menu in 5 groups. Urgent counts show next to Chats and Orders.",
  },
  {
    old: "Payments and order messages",
    now: "Campaigns › Automatic messages (order updates, UPI payments in WhatsApp).",
  },
  {
    old: "Accessibility",
    now: "Kept on every page: skip link, labelled buttons, visible focus.",
  },
];

const SIMPLIFIED = [
  "Menu: 22 items → 9 pages in 5 groups",
  "Each page has one job, with tabs for the rest",
  "One yellow button for the main action. Red only for problems, green only for “done”",
  "Rare actions (edit, cancel, undo) sit under “More”",
  "Costs, charts and Meta rules moved out of the home page",
];

export default function MenuGuidePage() {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="font-display font-semibold text-2xl sm:text-3xl text-ink">
          What changed
        </h1>
        <p className="mt-1 text-sm text-muted">
          A map from the old menu to the new pages.
        </p>
      </div>

      {/* 9 Pages Grid */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg text-ink">
          All pages
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {PAGES.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.href}
                href={p.href}
                className="card-3d flex flex-col items-start gap-2 p-4 rounded-2xl border-[1.5px] border-line bg-panel hover:border-ink transition"
              >
                <div className="flex items-center gap-2.5 font-display font-semibold text-[17px] text-ink">
                  <Icon className="size-[19px] shrink-0 text-ink dark:text-[#FFC329]" strokeWidth={2} />
                  <span>{p.title}</span>
                </div>
                <p className="text-[13px] text-muted leading-snug">
                  {p.desc}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Migration Table */}
      <section className="card-3d rounded-[18px] border-[1.5px] border-line bg-panel p-5">
        <div className="mb-4">
          <h2 className="font-display font-semibold text-[19px] text-ink">
            Where did the old sections go?
          </h2>
          <p className="text-[13.5px] text-muted mt-0.5">
            22 menu items became 9 pages. Nothing was removed.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px] border-collapse">
            <thead>
              <tr className="border-b-[1.5px] border-line">
                <th className="py-2.5 px-3 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Old place
                </th>
                <th className="py-2.5 px-3 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Now
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MAPPING.map((row) => (
                <tr key={row.old} className="hover:bg-[#FFF9F0]/50 dark:hover:bg-white/[0.02]">
                  <td className="py-3 px-3 font-semibold text-ink whitespace-nowrap align-top">
                    {row.old}
                  </td>
                  <td className="py-3 px-3 text-muted leading-relaxed">
                    {row.now}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* What Got Simpler */}
      <section className="card-3d rounded-[18px] border-[1.5px] border-line bg-panel p-5">
        <h2 className="font-display font-semibold text-[19px] text-ink mb-3">
          What got simpler
        </h2>
        <ul className="divide-y divide-line">
          {SIMPLIFIED.map((item) => (
            <li key={item} className="py-2.5 text-[14px] text-ink font-medium flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-brand shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
