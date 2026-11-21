import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { PageHead, Pill } from "../ui";

export const metadata: Metadata = { title: "Inbound messages" };
export const dynamic = "force-dynamic";

/** Claims older than this and not finished are counted as stuck. */
const minuteAgo = () => new Date(Date.now() - 60_000);

/**
 * Admin › Inbound: the latest WhatsApp messages Meta delivered (lib/engine/inbound.ts claims), whether each was
 * handled to the end, and why not. Only Meta's message ids, types and times: no phone numbers or message text.
 */
export default async function InboundPage() {
  await requireAdminPage();
  const [rows, stuck] = await Promise.all([
    db.inboundEvent.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    db.inboundEvent.count({ where: { processedAt: null, createdAt: { lt: minuteAgo() } } }),
  ]);
  return (
    <>
      <PageHead title="Inbound messages" sub="The latest messages Meta delivered to the webhook, and whether each was handled. Message ids only; no numbers or text." />
      <div className="card mb16">
        <p className="muted small" style={{ marginBottom: 10 }}>
          {rows.length} latest · {stuck} not finished after a minute (Meta retries those).
        </p>
        <table className="tbl" data-testid="inbound-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Message</th>
              <th>Handled</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt, "d MMM, h:mm:ss a")}</td>
                <td>{r.kind ?? "—"}</td>
                <td className="mono">…{r.id.slice(-10)}</td>
                <td>{r.processedAt ? <Pill tone="ok">Yes</Pill> : <Pill tone={r.lastError ? "bad" : "warn"}>{r.lastError ? "Failed" : "Not yet"}</Pill>}</td>
                <td className="small" style={{ maxWidth: 420, wordBreak: "break-word" }}>{r.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
