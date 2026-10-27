import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Metadata } from "next";
import { Wallet } from "@/components/icons";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Calendar3D, Messages3D, Rupee3D, Settings3D, Users3D, Wallet3D } from "@/components/icons-3d";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { SUPPLIER_INFO } from "@/lib/account-plans";
import { db } from "@/lib/db";
import { APP_TZ, fmtDate } from "@/lib/format";
import { getScope } from "@/lib/session";
import { walletBalance, walletBalances } from "@/lib/wallet";
import { CATEGORY_NAMES, chargeFor, ratesFor, rupees, WALLET_CATEGORIES, type WalletCategory } from "@/lib/wallet-rates";
import { AdjustForm, DecideRecharge, PaymentSettingsForm, RechargeForm, WalletSettingsForm } from "./wallet-forms";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Wallet" };

const KIND_LABEL: Record<string, string> = { RECHARGE: "Recharge", ADJUSTMENT: "Correction", REFUND: "Refund", MESSAGE: "Messages" };

/** The moment `n` days ago. */
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

function monthStart() {
  return fromZonedTime(`${formatInTimeZone(new Date(), APP_TZ, "yyyy-MM")}-01T00:00:00`, APP_TZ);
}

function StatusTag({ status }: { status: string }) {
  if (status === "PENDING") return <Badge tone="amber" dot>Waiting for check</Badge>;
  if (status === "REJECTED") return <Badge tone="red" dot>Turned down</Badge>;
  return <Badge tone="green" dot>Added</Badge>;
}

export default async function WalletPage() {
  const locked = await planGate();
  if (locked) return locked;
  const scope = await getScope();
  return scope.clientId ? <ClientWallet clientId={scope.clientId} isAdmin={scope.isAdmin} canManage={scope.canManage} /> : <AllWallets />;
}

/** Admin, no client picked: every wallet, recharges waiting, and Thabaal's payment details. */
async function AllWallets() {
  const [clients, pending, settings, monthCharges] = await Promise.all([
    db.client.findMany({ where: { billingMode: "wallet" }, select: { id: true, name: true, walletLowAlert: true }, orderBy: { name: "asc" } }),
    db.walletEntry.findMany({ where: { kind: "RECHARGE", status: "PENDING" }, include: { client: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.setting.findUnique({ where: { id: 1 }, select: { walletUpiId: true, walletPayee: true, gstEnabled: true, gstin: true } }),
    db.walletEntry.groupBy({ by: ["clientId"], where: { kind: "MESSAGE", status: "DONE", createdAt: { gte: monthStart() } }, _sum: { amount: true } }),
  ]);
  const balances = await walletBalances(clients.map((c) => c.id));
  const total = [...balances.values()].reduce((a, b) => a + b, 0);
  const spent = new Map(monthCharges.map((m) => [m.clientId, -(m._sum.amount ?? 0)]));
  const monthTotal = [...spent.values()].reduce((a, b) => a + b, 0);
  const pendingTotal = pending.reduce((a, b) => a + b.amount, 0);

  return (
    <>
      <PageHeader title="Wallets" description="Clients billed through the Thabaal wallet: Thabaal pays Meta, and each delivered message is taken from the client's balance." />

      <StaggerGroup className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StaggerItem index={0} className="h-full">
          <Stat label="Held in wallets" value={rupees(total)} sub={`${clients.length} wallet client${clients.length === 1 ? "" : "s"}`} tone="brand" />
        </StaggerItem>
        <StaggerItem index={1} className="h-full">
          <Stat label="Charged this month" value={rupees(monthTotal)} sub="Delivered messages, GST included" tone="info" />
        </StaggerItem>
        <StaggerItem index={2} className="h-full">
          <Stat label="Recharges to check" value={String(pending.length)} sub={pending.length ? `${rupees(pendingTotal)} waiting` : "Nothing waiting"} tone={pending.length ? "amber" : "brand"} />
        </StaggerItem>
        <StaggerItem index={3} className="h-full">
          <Stat label="Keep Meta above" value={rupees(Math.max(0, total))} sub="Meta's prepaid balance must cover every wallet" tone="violet" />
        </StaggerItem>
      </StaggerGroup>

      <Card className="card-3d mb-5">
        <CardHeader tone="amber" icon={<Wallet3D />} title="Recharges to check" description="Approve only after the money shows in your bank or UPI app. Match the amount and transaction ID." />
        {pending.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th numeric>Amount</Th>
                <Th>Transaction ID</Th>
                <Th>Sent</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium text-ink">{p.client.name}</Td>
                  <Td numeric>{rupees(p.amount)}</Td>
                  <Td className="font-mono text-xs">
                    {p.utr}
                    {p.note && <span className="block font-sans text-muted">{p.note}</span>}
                  </Td>
                  <Td className="text-xs text-muted">
                    {fmtDate(p.createdAt, "d MMM, h:mm a")}
                    {p.createdBy && <span className="block">by {p.createdBy}</span>}
                  </Td>
                  <Td>
                    <DecideRecharge id={p.id} label={`${rupees(p.amount)} from ${p.client.name}`} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">No recharges waiting.</p>
        )}
      </Card>

      <Card className="card-3d mb-5">
        <CardHeader tone="brand" icon={<Users3D />} title="Wallet clients" description="Pick a client in the sidebar to see their history, add money or change their rates." />
        {clients.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th numeric>Balance</Th>
                <Th numeric>This month</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const b = balances.get(c.id) ?? 0;
                return (
                  <tr key={c.id}>
                    <Td className="font-medium text-ink">{c.name}</Td>
                    <Td numeric className={b < 0 ? "text-danger" : undefined}>
                      {rupees(b)}
                    </Td>
                    <Td numeric>{rupees(spent.get(c.id) ?? 0)}</Td>
                    <Td>{b <= 0 ? <Badge tone="red" dot>Campaigns stopped</Badge> : b < c.walletLowAlert ? <Badge tone="amber" dot>Low</Badge> : <Badge tone="green" dot>OK</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Wallet className="size-5 shrink-0" />} title="No wallet clients yet">
            Pick a client in the sidebar, open Wallet and choose &ldquo;Thabaal wallet&rdquo;. Clients who pay Meta directly don&apos;t need one.
          </EmptyState>
        )}
      </Card>

      <Card className="card-3d">
        <CardHeader tone="violet" icon={<Rupee3D />} title="Payment details" description="Where clients pay their recharges. GST stays off until Thabaal's GSTIN is active." />
        <div className="p-4 sm:p-5">
          <PaymentSettingsForm initial={{ upiId: settings?.walletUpiId || SUPPLIER_INFO.vpa, payee: settings?.walletPayee || SUPPLIER_INFO.legal, gstEnabled: settings?.gstEnabled ?? false, gstin: settings?.gstin ?? "" }} />
        </div>
      </Card>
    </>
  );
}

/** One client's wallet: balance, recharge, history and (for Thabaal) billing settings. */
async function ClientWallet({ clientId, isAdmin, canManage }: { clientId: string; isAdmin: boolean; canManage: boolean }) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, billingMode: true, walletRates: true, walletLowAlert: true } });
  if (!client) return null;
  const rates = ratesFor(client.walletRates);
  const settingsForm = isAdmin ? (
    <Card className="card-3d mt-5">
      <CardHeader tone="violet" icon={<Settings3D />} title="Billing for this client" description="Only Thabaal sees this." />
      <div className="p-4 sm:p-5">
        <WalletSettingsForm clientId={client.id} initial={{ billingMode: client.billingMode === "wallet" ? "wallet" : "direct", rates, lowAlert: client.walletLowAlert }} />
      </div>
    </Card>
  ) : null;

  if (client.billingMode !== "wallet") {
    return (
      <>
        <PageHeader title="Wallet" description={`${client.name} pays Meta directly for WhatsApp messages, so there's no Thabaal wallet.`} />
        <Callout tone="info" title="Billed by Meta">
          Message charges go to the payment method in this business&apos;s own Meta account. Message spend still shows on the Dashboard and in the Message log.
        </Callout>
        {settingsForm}
      </>
    );
  }

  const since30 = daysAgo(30);
  const [balance, settings, money, pendingCount, monthAgg, daily] = await Promise.all([
    walletBalance(client.id),
    db.setting.findUnique({ where: { id: 1 }, select: { walletUpiId: true, walletPayee: true } }),
    db.walletEntry.findMany({ where: { clientId: client.id, kind: { not: "MESSAGE" } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.walletEntry.count({ where: { clientId: client.id, kind: "RECHARGE", status: "PENDING" } }),
    db.walletEntry.aggregate({ where: { clientId: client.id, kind: "MESSAGE", status: "DONE", createdAt: { gte: monthStart() } }, _sum: { amount: true }, _count: true }),
    db.$queryRaw<{ day: Date; category: string | null; n: bigint; total: number }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${APP_TZ}) AS day, category, count(*) AS n, sum(amount) AS total
      FROM "WalletEntry"
      WHERE "clientId" = ${client.id} AND kind = 'MESSAGE' AND status = 'DONE' AND "createdAt" >= ${since30}
      GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
  ]);
  const monthSpent = -(monthAgg._sum.amount ?? 0);
  const low = balance < client.walletLowAlert;

  return (
    <>
      <PageHeader title="Wallet" description="Thabaal pays Meta for your WhatsApp messages. Each delivered message Meta charges for is taken from this balance, GST included." />

      {balance <= 0 ? (
        <Callout tone="danger" title="Campaigns are stopped" className="mb-4">
          Your wallet is empty, so offers and campaigns wait. Order, payment and reply messages still go out and are taken from your next recharge.
        </Callout>
      ) : low ? (
        <Callout tone="warning" title="Balance is running low" className="mb-4">
          Add money soon so campaigns don&apos;t stop.
        </Callout>
      ) : null}

      <StaggerGroup className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StaggerItem>
          <Stat label="Balance" value={rupees(balance)} sub={pendingCount ? `${pendingCount} recharge${pendingCount === 1 ? "" : "s"} being checked` : "Available now"} tone={balance <= 0 ? "rose" : low ? "amber" : "brand"} />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Spent this month" value={rupees(monthSpent)} sub={`${monthAgg._count.toLocaleString("en-IN")} charged messages`} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Marketing message" value={`₹${chargeFor(rates.marketing).toFixed(4)}`} sub="each, GST included" tone="violet" />
        </StaggerItem>
        <StaggerItem>
          <Stat label="Utility message" value={`₹${chargeFor(rates.utility).toFixed(4)}`} sub="each, GST included" tone="violet" />
        </StaggerItem>
      </StaggerGroup>

      {canManage && (
        <ScrollReveal>
          <Card className="card-3d mb-5">
            <CardHeader tone="brand" icon={<Rupee3D />} title="Add money" description="Pay by UPI, then send the transaction ID. The money is added once Thabaal confirms it." />
            <div className="p-4 sm:p-5">
              <RechargeForm upiId={settings?.walletUpiId || SUPPLIER_INFO.vpa} payee={settings?.walletPayee || SUPPLIER_INFO.legal} clientName={client.name} />
            </div>
          </Card>
        </ScrollReveal>
      )}

      {isAdmin && (
        <ScrollReveal>
          <Card className="card-3d mb-5">
            <CardHeader tone="violet" icon={<Settings3D />} title="Add, refund or correct" description="Money received another way (cash, bank transfer), a refund, or a correction. Every change is kept in the history." />
            <div className="p-4 sm:p-5">
              <AdjustForm clientId={client.id} />
            </div>
          </Card>
        </ScrollReveal>
      )}

      <StaggerGroup className="grid gap-5 lg:grid-cols-2">
        <StaggerItem>
          <Card className="card-3d h-full">
            <CardHeader tone="brand" icon={<Calendar3D />} title="Recharges and changes" />
            {money.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>What</Th>
                    <Th numeric>Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {money.map((e) => (
                    <tr key={e.id}>
                      <Td className="text-xs text-muted">{fmtDate(e.createdAt, "d MMM yyyy")}</Td>
                      <Td>
                        {KIND_LABEL[e.kind] ?? e.kind}
                        {(e.utr || e.note) && <span className="block text-xs text-muted">{[e.utr, e.note].filter(Boolean).join(" · ")}</span>}
                      </Td>
                      <Td numeric className={`whitespace-nowrap ${e.amount < 0 ? "text-danger" : "text-ink"}`}>
                        {e.amount > 0 ? "+" : ""}
                        {rupees(e.amount)}
                      </Td>
                      <Td>
                        {e.kind === "RECHARGE" && e.status === "PENDING" && isAdmin ? <DecideRecharge id={e.id} label={rupees(e.amount)} /> : <StatusTag status={e.status} />}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">No recharges yet.</p>
            )}
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="card-3d h-full">
            <CardHeader tone="info" icon={<Messages3D />} title="Message charges, last 30 days" description="Only messages Meta charged for: delivered, and not free." />
            {daily.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Day</Th>
                    <Th>Type</Th>
                    <Th numeric>Messages</Th>
                    <Th numeric>Charged</Th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={`${d.day.toISOString()}-${d.category}`}>
                      <Td className="text-xs text-muted">{formatInTimeZone(d.day, "UTC", "d MMM")}</Td>
                      <Td className="capitalize">{d.category ?? "Other"}</Td>
                      <Td numeric>{Number(d.n).toLocaleString("en-IN")}</Td>
                      <Td numeric>{rupees(-Number(d.total))}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">No charged messages in the last 30 days.</p>
            )}
          </Card>
        </StaggerItem>
      </StaggerGroup>

      <ScrollReveal>
        <Card className="card-3d mt-5">
          <CardHeader tone="violet" icon={<Rupee3D />} title="Your rates" description="Per delivered message. Meta's free messages (most replies within 24 hours) cost nothing." />
          <Table>
            <thead>
              <tr>
                <Th>Message type</Th>
                <Th numeric>Rate</Th>
                <Th numeric>With 18% GST</Th>
              </tr>
            </thead>
            <tbody>
              {WALLET_CATEGORIES.map((c: WalletCategory) => (
                <tr key={c}>
                  <Td>{CATEGORY_NAMES[c]}</Td>
                  <Td numeric>₹{rates[c]}</Td>
                  <Td numeric>₹{chargeFor(rates[c]).toFixed(4)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </ScrollReveal>

      {settingsForm}
    </>
  );
}
