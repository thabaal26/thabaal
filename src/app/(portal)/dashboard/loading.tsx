import { OverviewSkeleton } from "@/components/skeletons";

// Shown instantly while a dashboard page loads, so taps feel responsive on slow networks.
export default function Loading() {
  return <OverviewSkeleton />;
}
