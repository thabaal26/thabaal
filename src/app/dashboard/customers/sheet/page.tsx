import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, PageHeader, PickClientNotice } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getScope } from "@/lib/session";
import { SheetForm } from "./sheet-form";

export const metadata: Metadata = { title: "Google Sheet sync" };
export const dynamic = "force-dynamic";

const CUSTOMER_COLUMNS = [
  ["Name", "Priya Sharma"],
  ["Phone", "98765 43210 (required)"],
  ["Area", "Sellur"],
  ["Tags", "ghee, vip (comma-separated)"],
  ["Buys", "Groundnut oil 1 L"],
  ["Opted out", "yes, to stop messages"],
];
const ORDER_COLUMNS = [
  ["Order No", "B-1042 (one row per item, same number)"],
  ["Date", "25/12/2026"],
  ["Phone", "98765 43210 (required)"],
  ["Name", "Priya Sharma"],
  ["Item", "Groundnut oil 1 L (required)"],
  ["Qty", "2"],
  ["Price", "280 (each), or Amount for the line total"],
  ["Address", "12, North St, Sellur"],
  ["Status", "new / dispatched / delivered (optional)"],
];

function Columns({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-line">
          {rows.map(([h, ex]) => (
            <tr key={h}>
              <td className="w-28 py-1.5 pr-3 font-mono font-medium text-ink">{h}</td>
              <td className="py-1.5 text-muted">{ex}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SheetPage() {
  const scope = await getScope();
  const back = (
    <Link href="/dashboard/customers" className="-my-2 mb-1 inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-ink sm:mb-3 sm:text-xs">
      <ArrowLeft className="size-3.5" /> Customers
    </Link>
  );
  if (!scope.clientId) return <>{back}<PageHeader title="Google Sheet sync" /><PickClientNotice what="Google Sheet" /></>;
  const client = await db.client.findUnique({
    where: { id: scope.clientId },
    select: { sheetCustomersUrl: true, sheetOrdersUrl: true, sheetSyncedAt: true, sheetSyncNote: true },
  });

  return (
    <>
      {back}
      <PageHeader
        title="Google Sheet sync"
        description="Keep customers and orders in a Google Sheet; the portal reads it every 30 minutes. New rows become customers and orders here, ready for campaigns and dispatch."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Your sheet"
              description={client?.sheetSyncedAt ? `Last synced ${fmtDate(client.sheetSyncedAt, "d MMM, h:mm a")}` : "Not synced yet"}
            />
            {client?.sheetSyncNote && (
              <p className={`mx-4 mt-4 rounded-lg px-3 py-2 text-xs sm:mx-5 ${/couldn|add a column|doesn't look/i.test(client.sheetSyncNote) ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
                {client.sheetSyncNote}
              </p>
            )}
            <SheetForm customersUrl={client?.sheetCustomersUrl ?? ""} ordersUrl={client?.sheetOrdersUrl ?? ""} />
          </Card>
          <Card>
            <CardHeader title="How to set it up" />
            <ol className="list-decimal space-y-2 p-4 pl-9 text-sm text-ink-2 sm:p-5 sm:pl-10">
              <li>Make a Google Sheet with two tabs: <b>Customers</b> and <b>Orders</b>. Put the column headings from the right in the first row.</li>
              <li>Click <b>Share</b> → General access → <b>Anyone with the link</b> → Viewer. Keep the link among staff only: anyone who has it can see the customers.</li>
              <li>Open the Customers tab and copy the address bar link (it ends with <code>#gid=…</code>). Do the same for the Orders tab. Paste both here and press Save &amp; sync.</li>
              <li>From then on, staff just add rows. Changes arrive within 30 minutes, or press Sync now.</li>
            </ol>
            <div className="space-y-1 border-t border-line p-4 text-xs text-muted sm:p-5">
              <p>• The sheet adds and updates; it never deletes customers or changes an order already here (track those in Orders).</p>
              <p>• Orders older than 2 days arrive as delivered (history for refill reminders); recent ones arrive as new, ready to confirm and dispatch.</p>
              <p>• &quot;Opted out: yes&quot; stops messages; the sheet can&apos;t opt someone back in.</p>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Customers tab columns" description="Any order; extra columns are ignored." />
            <div className="p-4 sm:p-5"><Columns rows={CUSTOMER_COLUMNS} /></div>
          </Card>
          <Card>
            <CardHeader title="Orders tab columns" />
            <div className="p-4 sm:p-5"><Columns rows={ORDER_COLUMNS} /></div>
          </Card>
        </div>
      </div>
    </>
  );
}
