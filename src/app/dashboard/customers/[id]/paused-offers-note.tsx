import { fmtDate } from "@/lib/format";

/** On a customer's page while Meta is holding marketing back from them. */
export function PausedOffersNote({ until }: { until: Date }) {
  return (
    <div className="rounded-control border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
      <p className="font-semibold">Offers paused until about {fmtDate(until, "d MMM")}</p>
      <p className="mt-0.5">
        Meta held back a marketing message because this customer gets a lot of offers. Campaigns skip them until then, and the held message is sent once more.
        Order updates and typed replies still go through.
      </p>
    </div>
  );
}
