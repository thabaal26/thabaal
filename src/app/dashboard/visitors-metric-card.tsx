"use client";

import { ArrowUp, Clock } from "lucide-react";

export function VisitorsMetricCard({
  customers,
  deliveryRate,
  totalMessages,
  avgTime = "1m 45s",
}: {
  customers: string;
  deliveryRate: string;
  totalMessages: string;
  avgTime?: string;
}) {
  return (
    <div className="rounded-[24px] border border-line-strong/20 bg-white p-5 sm:p-6 shadow-card">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-ink sm:text-base">Audience & Reach</h3>
        <p className="text-xs text-muted">Customer growth and delivery metrics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
        {/* Metric 1: Customers + Sparkline */}
        <div className="flex items-center justify-between gap-4 border-b sm:border-b-0 sm:border-r border-line-strong/15 pb-4 sm:pb-0 sm:pr-4">
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">{customers}</p>
            <p className="text-xs text-muted">Active Contacts</p>
          </div>
          {/* Green Sparkline Curve */}
          <div className="h-8 w-24">
            <svg viewBox="0 0 100 35" className="h-full w-full overflow-visible">
              <path
                d="M 0 25 Q 25 15, 50 20 T 100 5"
                fill="none"
                stroke="#22C55E"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Metric 2: Delivery Rate + Green Pill */}
        <div className="flex items-center justify-between gap-4 pb-4 sm:pb-0">
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">{deliveryRate}</p>
            <p className="text-xs text-muted">Delivery Rate</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[#E8F5E9] px-3 py-1 text-xs font-bold text-[#2E7D32] shadow-sm">
            <span>UP</span>
            <ArrowUp className="size-3" />
          </div>
        </div>

        {/* Metric 3: Total Volume + Cyan Sparkline */}
        <div className="flex items-center justify-between gap-4 border-b sm:border-b-0 sm:border-r border-line-strong/15 pb-4 sm:pb-0 sm:pr-4">
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">{totalMessages}</p>
            <p className="text-xs text-muted">Total Dispatched</p>
          </div>
          {/* Cyan Sparkline Curve */}
          <div className="h-8 w-24">
            <svg viewBox="0 0 100 35" className="h-full w-full overflow-visible">
              <path
                d="M 0 30 Q 30 20, 60 28 T 100 8"
                fill="none"
                stroke="#0EA5E9"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Metric 4: Avg Speed + Pill */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">{avgTime}</p>
            <p className="text-xs text-muted">Delivery Speed</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[#E8F5E9] px-3 py-1 text-xs font-bold text-[#2E7D32] shadow-sm">
            <span>TIME</span>
            <Clock className="size-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
