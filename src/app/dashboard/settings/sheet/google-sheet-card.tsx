import { ExternalLink, FileSpreadsheet, RefreshCw } from "@/components/icons";
import { ActionButton } from "@/components/action-button";
import { Badge, Callout, Card, CardHeader } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { fmtDate } from "@/lib/format";
import { sheetUrl } from "@/lib/gsheet/google";
import { sheetLinkView } from "@/lib/gsheet/sync";
import { googleSheetDisconnect, googleSheetRebuild, googleSheetSyncNow } from "../../actions/google-sheet";

/** What each tab of the connected sheet holds, in the words the sheet uses. */
const TABS: [string, string][] = [
  ["Summary", "today, this month, what's waiting, top products and customers"],
  ["Customers", "one row per customer: contact, address, orders and total spent"],
  ["Addresses", "every delivery address each customer has used"],
  ["Orders", "one row per order, updated as it's paid, packed and delivered"],
  ["Order Items", "one row per product in each order, for product-wise totals"],
  ["Payments", "every payment and refund as it happens"],
  ["Chats", "every WhatsApp message, both ways"],
  ["Activity", "what happened: orders placed, paid, cancelled, buttons tapped"],
];

const FLASH: Record<string, { tone: "success" | "danger" | "info"; text: string }> = {
  connected: { tone: "success", text: "Connected. Your sheet is being created and filled with everything so far; it then updates by itself." },
  cancelled: { tone: "info", text: "Google sign-in was cancelled. Nothing was changed." },
  expired: { tone: "danger", text: "That sign-in took too long or was for a different login. Please press Connect Google Sheets again." },
  "no-permission": { tone: "danger", text: "The box allowing Thabaal to create your sheet wasn't ticked. Press Connect again and tick it on Google's screen." },
  "not-allowed": { tone: "danger", text: "Only the business owner or a manager can connect Google Sheets." },
  "not-configured": { tone: "danger", text: "Google sign-in isn't set up on this server yet. Please contact Thabaal." },
  failed: { tone: "danger", text: "Google didn't complete the connection. Please try again in a minute." },
};

/** Settings › Google Sheet: connect the business's own Google Sheet, kept live. */
export async function GoogleSheetCard({ clientId, canManage, flash }: { clientId: string; canManage: boolean; flash?: string }) {
  const link = await sheetLinkView(clientId);
  const note = flash ? FLASH[flash] : undefined;
  const connect = (
    <a className={buttonClass("primary", "md")} href="/api/google/sheets/connect">
      <FileSpreadsheet aria-hidden className="size-4" /> {link ? "Connect again" : "Connect Google Sheets"}
    </a>
  );
  return (
    <Card className="card-3d">
      <CardHeader
        tone="brand"
        icon={<FileSpreadsheet />}
        title="Google Sheets · live"
        description="Your customers, orders, payments and chats in your own Google Sheet, updated as they happen"
        action={
          <Badge tone={link?.status === "connected" ? "green" : link ? "red" : "gray"} dot>
            {link?.status === "connected" ? "Live" : link ? "Needs attention" : "Not connected"}
          </Badge>
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        {note && (
          <Callout tone={note.tone} role="status">
            {note.text}
          </Callout>
        )}

        {link?.status === "error" && (
          <Callout tone="danger" title="The sheet stopped updating">
            {link.lastError ?? "Google access was removed."} {canManage ? "Press Connect again below; your sheet and its rows are kept." : "Ask a manager to connect it again."}
          </Callout>
        )}

        {link ? (
          <div className="space-y-3">
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="text-muted">Google account</dt>
              <dd className="font-medium text-ink">{link.email ?? "-"}</dd>
              <dt className="text-muted">Last update</dt>
              <dd className="font-medium text-ink">{link.syncedAt ? fmtDate(link.syncedAt, "d MMM, h:mm:ss a") : "Filling in your history..."}</dd>
            </dl>
            {link.status === "connected" && link.lastError && <p className="text-xs text-muted">{link.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass("primary", "md")} href={sheetUrl(link.spreadsheetId)} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden className="size-4" /> Open my sheet
              </a>
              {canManage && link.status === "connected" && (
                <ActionButton action={googleSheetSyncNow} size="md">
                  <RefreshCw aria-hidden className="size-4" /> Update now
                </ActionButton>
              )}
              {canManage && link.status === "error" && connect}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Sign in with the business&apos;s Google account and allow Thabaal to create one sheet. Thabaal can only open that sheet, never your other files.
            </p>
            {canManage ? connect : <p className="text-sm text-muted">Ask the business owner or a manager to connect it.</p>}
          </div>
        )}

        <ul className="space-y-1.5 border-t border-line pt-4 text-sm">
          {TABS.map(([tab, what]) => (
            <li key={tab} className="flex gap-2">
              <span className="w-28 shrink-0 font-medium text-ink">{tab}</span>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>

        {link && canManage && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {link.status === "connected" && (
              <ActionButton
                action={googleSheetRebuild}
                variant="ghost"
                confirm="Empty the sheet and write everything again? Changes typed into the sheet by hand will be lost."
              >
                Rebuild the sheet
              </ActionButton>
            )}
            <ActionButton action={googleSheetDisconnect} variant="danger" confirm="Stop updating the sheet? It stays in your Google Drive with everything so far.">
              Disconnect
            </ActionButton>
          </div>
        )}
        <p className="text-xs text-muted">
          The sheet is a live copy for reading, filtering and sharing. Make changes in Thabaal; edits typed into the sheet aren&apos;t read back.
        </p>
      </div>
    </Card>
  );
}
