"use client";

// The admin panel's left menu, grouped by job as in the approved admin design.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type Item = { href: string; label: string; icon: ReactNode; count?: number; soon?: boolean };

const I = {
  home: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  leads: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 20a7 7 0 0 1 14 0" />
      <circle cx="10" cy="8" r="3.6" />
      <path d="M18 7v6M15 10h6" />
    </svg>
  ),
  clients: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </svg>
  ),
  eye: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  usage: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </svg>
  ),
  pay: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14.5h2" />
    </svg>
  ),
  msg: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5.1A8 8 0 1 1 21 12z" />
    </svg>
  ),
  gear: (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  ),
};

export function AdminNav({ payments, newAccounts, leadsDue = 0 }: { payments: number; newAccounts: number; leadsDue?: number }) {
  const path = usePathname();
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Business",
      items: [
        { href: "/admin", label: "Overview", icon: I.home },
        { href: "/admin/enquiries", label: "Enquiries", icon: I.leads, count: leadsDue },
      ],
    },
    {
      title: "Clients",
      items: [
        { href: "/admin/clients", label: "All clients", icon: I.clients, count: newAccounts },
        { href: "/admin/support", label: "Help a client", icon: I.eye },
        { href: "/admin/usage", label: "Usage and analytics", icon: I.usage },
      ],
    },
    { title: "Money", items: [{ href: "/admin/payments", label: "Payments", icon: I.pay, count: payments }] },
    { title: "Reach out", items: [{ href: "/admin/messages", label: "Messages", icon: I.msg }] },
    { title: "Admin", items: [{ href: "/admin/settings", label: "Settings", icon: I.gear }] },
  ];
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="anav" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.title}>
          <h4>{g.title}</h4>
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}>
              {it.icon}
              <span>{it.label}</span>
              {it.count ? <span className="n">{it.count}</span> : it.soon ? <span className="soon">Soon</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Tabs that switch between panels already rendered on the server. */
export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; count?: number; panel: ReactNode }[]; initial?: string }) {
  const [on, setOn] = useState(initial ?? tabs[0]?.id);
  return (
    <>
      <div className="atabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={on === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={() => setOn(t.id)}>
            {t.label}
            {t.count ? <span className="n">{t.count}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <section key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={on !== t.id}>
          {t.panel}
        </section>
      ))}
    </>
  );
}
