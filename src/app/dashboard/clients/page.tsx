import { Building2, CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { deleteClientUser } from "../actions/clients";
import { AddLoginForm, AddNumberForm, BrandingForm, NewClientForm, NumberActions, ResetPasswordButton, TokenForm } from "./client-forms";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const scope = await getScope();
  if (!scope.isAdmin) redirect("/dashboard");

  const clients = await db.client.findMany({
    include: {
      users: { select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      numbers: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], include: { _count: { select: { campaigns: true } } } },
      _count: { select: { customers: true, campaigns: true, templates: true, pending: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Clients"
        description="Each client sees only their own customers, campaigns, templates and message log when they sign in. Their logins can view but not change anything."
        actions={<NewClientForm />}
      />

      {clients.length ? (
        <div className="space-y-6">
          {clients.map((c) => {
            const usable = c.numbers.filter((n) => n.token || c.waToken);
            const accounts = new Set(c.numbers.map((n) => n.businessAccountId)).size;
            return (
              <Card key={c.id}>
                <CardHeader
                  title={c.name}
                  description={`${fmtNumber(c._count.customers)} customers · ${c._count.campaigns} campaigns · ${c._count.templates} templates${c._count.pending ? ` · ${c._count.pending} without a phone number` : ""} · added ${fmtDate(c.createdAt, "d MMM yyyy")}`}
                  action={
                    usable.length ? (
                      <Badge tone="green" dot>{usable.length === 1 ? "Own WhatsApp number" : `${usable.length} WhatsApp numbers`}</Badge>
                    ) : (
                      <Badge tone="amber" dot>Uses default number</Badge>
                    )
                  }
                />
                <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Logins</h3>
                    {c.users.length ? (
                      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                        {c.users.map((u) => (
                          <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{u.name}</p>
                              <p className="truncate text-xs text-muted">{u.email}</p>
                            </div>
                            <ResetPasswordButton userId={u.id} email={u.email} />
                            <ActionButton action={deleteClientUser.bind(null, u.id)} variant="ghost" confirm={`Remove ${u.email}? They won't be able to sign in.`}>
                              Remove
                            </ActionButton>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No logins yet.</p>
                    )}
                    <AddLoginForm clientId={c.id} />
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">WhatsApp numbers</h3>
                    <div className="mt-2">
                      <TokenForm clientId={c.id} hasToken={!!c.waToken} />
                    </div>
                    {c.numbers.length ? (
                      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                        {c.numbers.map((n) => (
                          <li key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                            {n.token || c.waToken ? <CheckCircle2 className="size-4 shrink-0 text-brand" /> : <Circle className="size-4 shrink-0 text-line" />}
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                {n.label}
                                {n.isDefault && <Badge tone="green">Default</Badge>}
                                {n.verifiedName === "Test Number" && <Badge tone="amber">Test</Badge>}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {n.displayPhone ?? "—"}
                                {n.verifiedName && n.verifiedName !== "Test Number" ? ` · ${n.verifiedName}` : ""}
                                {accounts > 1 ? ` · account ${n.businessAccountId}` : ""}
                                {n._count.campaigns ? ` · ${n._count.campaigns} campaign${n._count.campaigns > 1 ? "s" : ""}` : ""}
                              </p>
                            </div>
                            <NumberActions id={n.id} label={n.label} isDefault={n.isDefault} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-muted">No numbers yet, so this client&apos;s campaigns send from the default number in Settings.</p>
                    )}
                    <AddNumberForm clientId={c.id} hasToken={!!c.waToken} />
                  </section>

                  <section className="border-t border-line pt-5 lg:col-span-2">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Branding</h3>
                      {c.brandPrimary && (
                        <span className="flex gap-1">
                          {[c.brandPrimary, c.brandAccent].filter(Boolean).map((hex) => (
                            <span key={hex} title={hex!} className="size-4 rounded-full ring-1 ring-black/10" style={{ background: hex! }} />
                          ))}
                        </span>
                      )}
                      <span className="text-xs text-muted">{c.brandPrimary || c.logoUrl ? "Their login sees their own logo, colours and banner." : "Default portal look."}</span>
                    </div>
                    <BrandingForm
                      clientId={c.id}
                      name={c.name}
                      initial={{
                        brandPrimary: c.brandPrimary ?? "",
                        brandAccent: c.brandAccent ?? "",
                        logoUrl: c.logoUrl ?? "",
                        bannerUrl: c.bannerUrl ?? "",
                        tagline: c.tagline ?? "",
                        website: c.website ?? "",
                        supportPhone: c.supportPhone ?? "",
                      }}
                    />
                  </section>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<Building2 className="size-5" />} title="No clients yet">
            Add your first client, then upload their customers and give them a login.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
