"use client"; // Error boundaries must be Client Components

import { RotateCcw, TriangleAlert } from "@/components/icons";
import Link from "@/components/intent-link";
import { useEffect } from "react";
import { Button, Card } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";

/** Shown in place of a dashboard page that failed to load, keeping the sidebar and tabs usable. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert" className="card-3d mx-auto mt-6 max-w-lg">
      <div className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
        <div aria-hidden className="mb-4 grid size-12 place-items-center rounded-full bg-danger-bg text-danger ring-8 ring-danger-bg/40">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-base font-semibold text-ink">This page couldn&apos;t load</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Check your internet connection and try again. Campaigns already scheduled keep sending on the server.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden className="size-4" /> Try again
          </Button>
          <Link href="/dashboard" className={buttonClass("secondary")}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </Card>
  );
}
