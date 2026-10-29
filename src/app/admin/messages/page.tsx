import type { Metadata } from "next";
import Link from "next/link";
import { loadClientRows } from "@/lib/admin-data";
import { requireAdminPage } from "@/lib/session";
import { ComingNext, PageHead, Pill } from "../ui";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

/**
 * Bulk and automatic WhatsApp messages to business owners need approved templates on Thabaal's own number and
 * owner phone numbers on record (phase 2). Until then: who can be reached, and one-tap WhatsApp to each owner.
 */
export default async function MessagesPage() {
  await requireAdminPage();
  const { rows } = await loadClientRows();
  const wa = (p: string | null) => {
    const d = (p ?? "").replace(/\D/g, "");
    return d ? (d.length === 10 ? `91${d}` : d) : null;
  };

  return (
    <>
      <PageHead title="Messages" sub="Reminders, offers and news to business owners, from one place." />
      <div className="mb16">
        <ComingNext
          title="Sending from here comes in phase 2"
          items={[
            "Approved WhatsApp templates on Thabaal's own number for payment reminders, overdue warnings and news",
            "Pick who gets it (unpaid, at risk, everyone) with {shop}, {owner}, {amount} and {date} filled in",
            "Automatic reminders before and after the due date, with quiet hours",
            "A log of what was sent and whether it was read",
          ]}
        >
          Nothing is sent from this page yet, so no business owner gets a message by accident. Each owner&apos;s WhatsApp opens below in one tap, with nothing sent until you press send in WhatsApp.
        </ComingNext>
      </div>
      <div className="card">
        <div className="hd">
          <div>
            <h2>Reach an owner now</h2>
            <p>Uses the support phone saved on each business (client page › Branding and contact).</p>
          </div>
        </div>
        <div className="list">
          {rows.map((r) => {
            const n = wa(r.phone);
            return (
              <div className="row" key={r.id}>
                <div className="grow">
                  <div className="t">
                    <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                  </div>
                  <div className="muted small">{r.owner ? `${r.owner.name} <${r.owner.email}>` : "No owner login yet"}</div>
                </div>
                <Pill tone={r.stateTone}>{r.stateLabel}</Pill>
                {n ? (
                  <a className="btn sm" href={`https://wa.me/${n}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                ) : r.owner ? (
                  <a className="btn sm" href={`mailto:${r.owner.email}`}>
                    Email
                  </a>
                ) : (
                  <span className="muted small">no contact saved</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
