"use client";

function DonutRing({
  pct,
  color,
  bgColor,
  label,
  sub,
}: {
  pct: number;
  color: string;
  bgColor: string;
  label: string;
  sub: string;
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative size-24 sm:size-28 flex items-center justify-center">
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          {/* Background Ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={bgColor}
            strokeWidth="11"
          />
          {/* Progress Ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth="11"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center Percentage */}
        <span className="absolute text-base sm:text-lg font-bold text-ink">
          {pct}%
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink">{label}</p>
      <p className="text-2xs text-muted">{sub}</p>
    </div>
  );
}

export function DonutGauges({
  deliveryRate,
  readRate,
  replyRate,
  deliveredCount,
  readCount,
  repliesCount,
}: {
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  deliveredCount: number;
  readCount: number;
  repliesCount: number;
}) {
  return (
    <div className="rounded-[24px] border border-line-strong/20 bg-white p-5 sm:p-6 shadow-card">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink sm:text-base">Message Health & Engagement</h3>
          <p className="text-xs text-muted">Delivery funnel conversion rates</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-6 py-2">
        <DonutRing
          pct={deliveryRate}
          color="#F59E0B"
          bgColor="#FEF3C7"
          label="Delivered"
          sub={`${deliveredCount} total`}
        />
        <DonutRing
          pct={readRate}
          color="#A855F7"
          bgColor="#F3E8FF"
          label="Read Rate"
          sub={`${readCount} opened`}
        />
        <DonutRing
          pct={replyRate}
          color="#6366F1"
          bgColor="#E0E7FF"
          label="Replies & Clicks"
          sub={`${repliesCount} actions`}
        />
      </div>
    </div>
  );
}
