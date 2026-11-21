import { redirect } from "next/navigation";
import { getScope } from "@/lib/session";
import { ConnectWhatsApp } from "./connect-whatsapp";
import { OverviewScreen } from "./overview-screen";

export const dynamic = "force-dynamic";

/** Home: today's live summary. The full analysis is on Reports. */
export default async function Home({ searchParams }: PageProps<"/dashboard">) {
  // An admin with no business open belongs in the admin panel, which replaced the all-clients home.
  const scope = await getScope();
  if (scope.isAdmin && !scope.clientId) redirect("/admin");
  return (
    <>
      <ConnectWhatsApp />
      <OverviewScreen sp={await searchParams} mode="home" />
    </>
  );
}
