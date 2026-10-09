import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Card, CardHeader, EmptyState, PageHeader, PickClientNotice } from "@/components/ui";
import { audienceWhere, describeFilter, type AudienceFilter } from "@/lib/audiences";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { deleteAudience } from "../../actions/audiences";
import { AudienceBuilder } from "./audience-builder";

export const metadata: Metadata = { title: "Audiences" };
export const dynamic = "force-dynamic";

export default async function AudiencesPage() {
  const scope = await getScope();
  const back = { href: "/dashboard/customers", label: "Customers" };
  if (!scope.clientId || !scope.canManage) return <><PageHeader title="Audiences" back={back} /><PickClientNotice what="audiences" /></>;
  const clientId = scope.clientId;

  const [saved, regionRows] = await Promise.all([
    db.audience.findMany({ where: { clientId }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { clientId, region: { not: null } }, select: { region: true }, distinct: ["region"] }),
  ]);
  const counts = await Promise.all(saved.map(async (a) => db.customer.count({ where: await audienceWhere(clientId, a.filter as AudienceFilter) })));

  return (
    <>
      <PageHeader
        title="Audiences"
        back={back}
        description="Saved groups of customers, like ghee buyers with no order for 30 days. Pick one under Send to in a campaign; it's counted again every time the campaign runs."
      />
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <AudienceBuilder regions={regionRows.map((r) => r.region!).sort()} />
        <Card className="lg:sticky lg:top-8">
          <CardHeader title="Saved audiences" />
          {saved.length ? (
            <ul className="divide-y divide-line">
              {saved.map((a, k) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-muted">{describeFilter(a.filter as AudienceFilter)}</p>
                  </div>
                  <span className="tabular shrink-0 pt-0.5 text-sm font-medium" title="Customers now">{fmtNumber(counts[k])}</span>
                  <ActionButton action={deleteAudience.bind(null, a.id)} variant="ghost" size="sm" confirm={`Delete "${a.name}"?`} aria-label={`Delete ${a.name}`}>Delete</ActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<UsersRound className="size-5" />} title="No audiences yet">Build one on the left, or start from a preset.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
