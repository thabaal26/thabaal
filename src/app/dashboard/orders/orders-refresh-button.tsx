"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export function OrdersRefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isPending}
      title="Refresh orders list"
      aria-label="Refresh orders"
      className={cn(
        buttonClass("secondary"),
        "transition-all active:scale-95 disabled:opacity-60",
        className
      )}
    >
      <RefreshCw
        aria-hidden
        className={cn("size-4 shrink-0", isPending && "animate-spin text-brand")}
      />
      <span className="max-sm:hidden">
        {isPending ? "Refreshing…" : "Refresh"}
      </span>
    </button>
  );
}
