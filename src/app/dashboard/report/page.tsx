import type { Metadata } from "next";
import { PageHeader, PickClientNotice } from "@/components/ui";
import { getScope } from "@/lib/session";
import { getComprehensiveReportData } from "@/lib/reports-data";
import { ReportDashboard } from "./report-dashboard";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const scope = await getScope();
  if (!scope.clientId) {
    return (
      <>
        <PageHeader title="Reports" />
        <PickClientNotice what="reports" />
      </>
    );
  }

  const data = await getComprehensiveReportData(scope.clientId);

  return <ReportDashboard data={data} />;
}
