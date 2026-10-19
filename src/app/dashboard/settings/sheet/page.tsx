import { Radio, Send } from "@/components/icons";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Badge, Callout, Card, CardHeader, PageHeader, PickClientNotice } from "@/components/ui";
import { sheetHookStatus } from "@/lib/google-sheets-live";
import { testSheetConnection } from "../../actions/sheets";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getScope } from "@/lib/session";
import { SheetForm } from "./sheet-form";
import { SheetHookForm } from "./sheet-hook-form";

export const metadata: Metadata = { title: "Google Sheet sync" };
export const dynamic = "force-dynamic";

const CUSTOMER_COLUMNS = [
  ["Name", "Priya Sharma"],
  ["Phone", "98765 43210 (required)"],
  ["Area", "Anna Nagar"],
  ["Tags", "vip, wholesale (comma-separated)"],
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
  ["Address", "12, North St, Anna Nagar"],
  ["Status", "new / dispatched / delivered (optional)"],
];

function Columns({ rows }: { rows: string[][] }) {
  return (
    <div>
      <table className="ui-table w-full text-xs">
        <thead className="sr-only">
          <tr>
            <th scope="col">Column heading</th>
            <th scope="col">Example</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([h, ex]) => (
            <tr key={h}>
              <th scope="row" className="w-28 py-2 pr-3 text-left align-top font-mono font-medium text-ink">{h}</th>
              <td className="py-2 text-muted">{ex}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LIVE_TABS = [
  ["Live Orders", "one row per order, kept up to date as it's confirmed, paid, dispatched, delivered"],
  ["Order History", "every order change, as a log"],
  ["Chats", "messages customers send"],
  ["Button Clicks", "buttons customers tap"],
  ["Campaign Messages", "each campaign message and its delivery status"],
];

/** Portal → sheet: whether this business sends events to its own sheet, and a button that proves it end to end. */
async function LiveUpdatesCard({ clientId, canManage, linked }: { clientId: string; canManage: boolean; linked: string }) {
  const s = await sheetHookStatus(clientId);
  return (
    <Card className="card-3d">
      <CardHeader
        tone="gold"
        icon={<Radio />}
        title="Live updates to the sheet"
        description="Orders, chats and campaign results are written to your sheet as they happen"
        action={<Badge tone={s.state === "on" ? "green" : "red"} dot>{s.state === "on" ? "On" : "Off"}</Badge>}
      />
      <div className="space-y-4 p-4 sm:p-5">
        {s.state === "on" ? (
          s.hasSecret ? (
            <p className="text-sm text-ink-2">{s.hint} Use the test to check the sheet answers.</p>
          ) : (
            <Callout tone="warning" title="Add a secret to this sheet">{s.hint}</Callout>
          )
        ) : (
          <Callout tone={s.state === "invalid" ? "danger" : "info"} title={s.state === "invalid" ? "The sheet link isn't right" : "Live updates are off"}>
            {s.hint} {canManage ? "Paste the script's web app link below." : "Ask a manager to link the sheet."}
          </Callout>
        )}
        <ul className="space-y-1.5 text-sm">
          {LIVE_TABS.map(([tab, what]) => (
            <li key={tab} className="flex gap-2">
              <span className="w-36 shrink-0 font-medium text-ink">{tab}</span>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
        {canManage && <SheetHookForm linked={linked} source={s.source} hasSecret={s.hasSecret} />}
        {s.state === "on" && (
          <ActionButton action={testSheetConnection} size="md">
            <Send aria-hidden className="size-4 shrink-0" /> Send test to the sheet
          </ActionButton>
        )}
      </div>
    </Card>
  );
}

export default async function SheetPage() {
  const scope = await getScope();
  const back = { href: "/dashboard/settings", label: "Settings" };
  if (!scope.clientId) return <><PageHeader title="Google Sheet sync" back={back} /><PickClientNotice what="Google Sheet" /></>;
  const client = await db.client.findUnique({
    where: { id: scope.clientId },
    select: { sheetCustomersUrl: true, sheetOrdersUrl: true, sheetSyncedAt: true, sheetSyncNote: true, sheetHookUrl: true },
  });

  return (
    <>
      <PageHeader
        title="Google Sheet sync"
        back={back}
        description="Keep customers and orders in a Google Sheet; the portal reads it every 30 minutes. New rows become customers and orders here, ready for campaigns and dispatch."
      />
      <StaggerGroup className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <StaggerItem className="space-y-4 sm:space-y-6">
          <Card className="card-3d">
            <CardHeader
              tone="brand"
              title="Your sheet"
              description={client?.sheetSyncedAt ? `Last synced ${fmtDate(client.sheetSyncedAt, "d MMM, h:mm a")}` : "Not synced yet"}
            />
            {client?.sheetSyncNote && (
              <Callout className="mx-4 mt-4 sm:mx-5" tone={/couldn|add a column|doesn't look/i.test(client.sheetSyncNote) ? "danger" : "success"} role="status">
                {client.sheetSyncNote}
              </Callout>
            )}
            <SheetForm customersUrl={client?.sheetCustomersUrl ?? ""} ordersUrl={client?.sheetOrdersUrl ?? ""} />
          </Card>
          <LiveUpdatesCard clientId={scope.clientId} canManage={scope.canManage} linked={client?.sheetHookUrl ?? ""} />
          <Card className="card-3d">
            <CardHeader tone="info" title="How to set it up" />
            <ol className="list-decimal space-y-2 p-4 pl-9 text-sm text-ink-2 sm:p-5 sm:pl-10">
              <li>Make a Google Sheet with two tabs: <b>Customers</b> and <b>Orders</b>. Put the column headings from the right in the first row of each tab.</li>
              <li>Click the top-right <b>Share</b> button in Google Sheets → General access → <b>Anyone with the link</b> → <b>Viewer</b>.</li>
              <li>Click <b>Copy link</b>, paste it in the field above, and press <b>Save &amp; sync</b>. Both Customers and Orders sync automatically!</li>
              <li>From then on, staff just add or update rows in Google Sheets. Changes arrive every 30 minutes, or press <b>Sync now</b>.</li>
            </ol>
            <div className="space-y-1 border-t border-line p-4 text-xs text-muted sm:p-5">
              <p>• The sheet adds and updates; it never deletes customers or changes an order already here (track those in Orders).</p>
              <p>• Orders older than 2 days arrive as delivered (history for reorder reminders); recent ones arrive as new, ready to confirm and dispatch.</p>
              <p>• &quot;Opted out: yes&quot; stops messages; the sheet can&apos;t opt someone back in.</p>
            </div>
          </Card>
        </StaggerItem>
        <StaggerItem className="space-y-4 sm:space-y-6">
          <Card className="card-3d">
            <CardHeader tone="violet" title="Customers tab columns" description="Any order; extra columns are ignored." />
            <div className="p-4 sm:p-5"><Columns rows={CUSTOMER_COLUMNS} /></div>
          </Card>
          <Card className="card-3d">
            <CardHeader tone="gold" title="Orders tab columns" />
            <div className="p-4 sm:p-5"><Columns rows={ORDER_COLUMNS} /></div>
          </Card>
        </StaggerItem>
      </StaggerGroup>
    </>
  );
}
