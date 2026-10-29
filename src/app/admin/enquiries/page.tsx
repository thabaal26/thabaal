import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { loadClientRows } from "@/lib/admin-data";
import { APP_TZ } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { ComingNext, PageHead, Pill } from "../ui";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

const NEW_DAYS = 30;

/**
 * The enquiry pipeline in the design needs a place to keep leads, which thabaal doesn't have yet (phase 2).
 * Meanwhile this shows the real thing that exists: businesses that signed up on their own lately.
 */
export default async function EnquiriesPage() {
  await requireAdminPage();
  const now = new Date();
  const since = now.getTime() - NEW_DAYS * 86_400_000;
  const { rows } = await loadClientRows(now);
  const fresh = rows.filter((r) => r.createdAt.getTime() >= since).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <>
      <PageHead title="Enquiries" sub="Everyone who asked about thabaal, and what to do next." />
      <div className="mb16">
        <ComingNext
          title="The enquiry pipeline comes in phase 2"
          items={[
            "A place to keep enquiries: shop, owner, phone, town, what they sell, the plan they asked about",
            "Stages from new enquiry to paying shop, with follow-up dates and who follows up",
            "Calls logged against each enquiry, and turning a won enquiry into a business without typing it twice",
            "Where leads come from and how each person on the team is doing",
          ]}
        >
          thabaal has no enquiry records yet: the website&apos;s buttons open WhatsApp, email or sign-up directly. Nothing is shown here until real enquiries are stored, so the pipeline never shows sample shops.
        </ComingNext>
      </div>
      <div className="card">
        <div className="hd">
          <div>
            <h2>Signed up in the last {NEW_DAYS} days</h2>
            <p>Businesses that created an account themselves (or were added by you). These are the leads you have today.</p>
          </div>
          <Pill tone="info">{String(fresh.length)}</Pill>
        </div>
        {fresh.length ? (
          <div className="list">
            {fresh.map((r) => (
              <div className="row" key={r.id}>
                <div className="grow">
                  <div className="t">
                    <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                    {r.city ? <span className="muted small"> · {r.city}</span> : null}
                  </div>
                  <div className="muted small">
                    {r.owner ? `${r.owner.name} <${r.owner.email}>` : "No owner login yet"} · joined {formatInTimeZone(r.createdAt, APP_TZ, "d MMM yyyy")}
                    {r.connected ? " · WhatsApp connected" : " · WhatsApp not connected"}
                  </div>
                </div>
                <Pill tone={r.stateTone}>{r.stateLabel}</Pill>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">No new businesses in the last {NEW_DAYS} days.</p>
        )}
      </div>
    </>
  );
}
