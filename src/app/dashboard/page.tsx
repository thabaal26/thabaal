import { OverviewScreen } from "./overview-screen";

export const dynamic = "force-dynamic";

/** Home: today's live summary. The full analysis is on Reports. */
export default async function Home({ searchParams }: PageProps<"/dashboard">) {
  return <OverviewScreen sp={await searchParams} mode="home" />;
}
