"use client";

import { useState } from "react";

export function ActivityTrendCard({
  sentCount,
  failedCount,
  deliveredCount,
}: {
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
}) {
  const [tab, setTab] = useState<"all" | "campaigns">("all");
  const [period, setPeriod] = useState<"year" | "month" | "day">("month");

  return (
    <div className="rounded-[24px] border border-line-strong/20 bg-white p-5 sm:p-6 shadow-card flex flex-col justify-between">
      <div>
        {/* Top Pill Tab Switcher */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink sm:text-base">Message Velocity</p>
          <div className="inline-flex rounded-full bg-[#EBF3F0] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`rounded-full px-3 py-1 transition ${
                tab === "all" ? "bg-[#247458] text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              All In
            </button>
            <button
              type="button"
              onClick={() => setTab("campaigns")}
              className={`rounded-full px-3 py-1 transition ${
                tab === "campaigns" ? "bg-[#247458] text-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              Campaigns
            </button>
          </div>
        </div>

        {/* 3 Status Numbers */}
        <div className="mb-5 grid grid-cols-3 gap-2 border-b border-line-strong/15 pb-4 text-center">
          <div>
            <p className="text-xl font-bold text-ink">{sentCount}</p>
            <p className="text-2xs text-muted font-medium">Sent</p>
          </div>
          <div>
            <p className="text-xl font-bold text-danger">{failedCount}</p>
            <p className="text-2xs text-muted font-medium">Failed</p>
          </div>
          <div>
            <p className="text-xl font-bold text-[#247458]">{deliveredCount}</p>
            <p className="text-2xs text-muted font-medium">Delivered</p>
          </div>
        </div>

        {/* Smooth Green Wave Line Chart (Matches Mockup's Curve) */}
        <div className="relative h-28 w-full my-2">
          <svg viewBox="0 0 300 90" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#247458" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#247458" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 55 C 30 20, 60 70, 90 40 C 120 10, 150 80, 180 50 C 210 20, 240 60, 270 30 L 300 45 L 300 90 L 0 90 Z"
              fill="url(#waveGrad)"
            />
            <path
              d="M 0 55 C 30 20, 60 70, 90 40 C 120 10, 150 80, 180 50 C 210 20, 240 60, 270 30 L 300 45"
              fill="none"
              stroke="#247458"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Bottom Period Filter Buttons */}
      <div className="mt-4 flex items-center justify-center gap-1.5 pt-2">
        {(["year", "month", "day"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3.5 py-1 text-2xs font-bold capitalize transition ${
              period === p ? "bg-[#247458] text-white shadow-sm" : "bg-[#F3F7F5] text-muted hover:text-ink"
            }`}
          >
            {p === "year" ? "Yearly" : p === "month" ? "Monthly" : "Day"}
          </button>
        ))}
      </div>
    </div>
  );
}
