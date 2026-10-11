"use client";

import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles } from "@/components/icons";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Returns today's date in YYYY-MM-DD in Asia/Kolkata timezone (or browser fallback).
 */
export function getTodayStr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

/**
 * Adds `days` to a YYYY-MM-DD date string and returns the new YYYY-MM-DD string.
 */
export function addDaysToStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Formats YYYY-MM-DD into a friendly label like "Thu, 15 Oct 2026".
 */
export function formatCalendarDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const WEEKDAYS = [
  { short: "Sun", narrow: "S" },
  { short: "Mon", narrow: "M" },
  { short: "Tue", narrow: "T" },
  { short: "Wed", narrow: "W" },
  { short: "Thu", narrow: "T" },
  { short: "Fri", narrow: "F" },
  { short: "Sat", narrow: "S" },
];

export function CalendarPicker({
  value,
  onChange,
  minDate,
  className,
}: {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string;
  className?: string;
}) {
  const todayStr = useMemo(() => getTodayStr(), []);
  const effectiveMin = minDate ?? todayStr;

  // View month state (0-indexed month)
  const [viewYear, setViewYear] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return Number(value.split("-")[0]);
    }
    return Number(todayStr.split("-")[0]);
  });

  const [viewMonth, setViewMonth] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return Number(value.split("-")[1]) - 1;
    }
    return Number(todayStr.split("-")[1]) - 1;
  });

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }

  const [todayYear, todayMonthNum] = todayStr.split("-").map(Number);
  const isCurrentMonthOrPast = viewYear < todayYear || (viewYear === todayYear && viewMonth <= todayMonthNum - 1);

  function prevMonth() {
    if (isCurrentMonthOrPast) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setViewYear(todayYear);
    setViewMonth(todayMonthNum - 1);
    onChange(todayStr);
  }

  // Calculate days in view month
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  // Quick presets based on today
  const presets = useMemo(() => {
    const tomorrowStr = addDaysToStr(todayStr, 1);
    const dayAfterStr = addDaysToStr(todayStr, 2);
    const in7DaysStr = addDaysToStr(todayStr, 7);

    // Find next Saturday or Sunday
    const [y, m, d] = todayStr.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sun, 6 = Sat
    const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
    const thisSatStr = addDaysToStr(todayStr, daysUntilSat);

    // Find next Monday
    const daysUntilMon = (1 - dayOfWeek + 7) % 7 || 7;
    const nextMonStr = addDaysToStr(todayStr, daysUntilMon);

    return [
      { label: "Today", date: todayStr },
      { label: "Tomorrow", date: tomorrowStr },
      { label: "In 2 days", date: dayAfterStr },
      { label: "This Saturday", date: thisSatStr },
      { label: "Next Monday", date: nextMonStr },
      { label: "In 7 days", date: in7DaysStr },
    ];
  }, [todayStr]);

  const daysGrid = useMemo(() => {
    const cells: { day: number; dateStr: string; isPast: boolean; isToday: boolean; isSelected: boolean }[] = [];
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isPast = dateStr < effectiveMin;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === value;
      cells.push({ day: d, dateStr, isPast, isToday, isSelected });
    }
    return cells;
  }, [viewYear, viewMonth, totalDaysInMonth, effectiveMin, todayStr, value]);

  // Selected date status relative to today
  const selectedDiffDays = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [vy, vm, vd] = value.split("-").map(Number);
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const valTime = new Date(vy, vm - 1, vd).getTime();
    const todayTime = new Date(ty, tm - 1, td).getTime();
    return Math.round((valTime - todayTime) / 86_400_000);
  }, [value, todayStr]);

  return (
    <div className={cn("space-y-3 rounded-card border border-line bg-panel p-3.5 sm:p-4 shadow-xs", className)}>
      {/* Quick presets pills */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <Sparkles aria-hidden className="size-3.5 text-brand" />
          <span>Quick date pick</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = value === p.date;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange(p.date);
                  const [py, pm] = p.date.split("-").map(Number);
                  setViewYear(py);
                  setViewMonth(pm - 1);
                }}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95 pointer-coarse:min-h-10 pointer-coarse:px-3",
                  on
                    ? "border-brand bg-brand text-white shadow-xs"
                    : "border-line bg-sunken/60 text-ink-2 hover:border-line-strong hover:bg-sunken",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar Header: Month + Prev/Next buttons */}
      <div className="flex items-center justify-between border-t border-line/60 pt-3">
        <div className="flex items-center gap-2">
          <CalendarIcon aria-hidden className="size-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink">{monthLabel}</h3>
          {!isCurrentMonthOrPast && (
            <button
              type="button"
              onClick={goToToday}
              className="text-2xs font-medium text-brand hover:underline"
            >
              (back to today)
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={isCurrentMonthOrPast}
            onClick={prevMonth}
            className="grid size-8 place-items-center rounded-control border border-line bg-panel text-ink transition hover:bg-sunken disabled:opacity-30 disabled:pointer-events-none active:scale-95"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={nextMonth}
            className="grid size-8 place-items-center rounded-control border border-line bg-panel text-ink transition hover:bg-sunken active:scale-95"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="select-none">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w.short} className="py-1">
              <span className="hidden sm:inline">{w.short}</span>
              <span className="sm:hidden">{w.narrow}</span>
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty spacer cells */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9 sm:h-10" aria-hidden />
          ))}

          {/* Actual days */}
          {daysGrid.map((c) => {
            return (
              <button
                key={c.dateStr}
                type="button"
                disabled={c.isPast}
                onClick={() => onChange(c.dateStr)}
                aria-label={`${c.day} ${monthLabel}${c.isToday ? ", today" : ""}`}
                aria-pressed={c.isSelected}
                className={cn(
                  "relative flex h-9 sm:h-10 w-full items-center justify-center rounded-control text-xs sm:text-sm font-medium transition active:scale-95 pointer-coarse:min-h-10",
                  c.isSelected
                    ? "border border-brand bg-brand text-white shadow-xs font-semibold"
                    : c.isToday
                      ? "border border-brand text-brand-deep bg-brand-soft/50 font-semibold hover:bg-brand-soft"
                      : c.isPast
                        ? "text-muted/35 cursor-not-allowed pointer-events-none"
                        : "text-ink hover:bg-sunken active:bg-brand-soft",
                )}
              >
                <span>{c.day}</span>
                {c.isToday && !c.isSelected && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 size-1 rounded-full bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date confirmation card & native input fallback */}
      <div className="flex flex-col gap-2 rounded-control bg-sunken/60 p-2.5 sm:flex-row sm:items-center sm:justify-between border border-line/60">
        <div className="min-w-0">
          <p className="text-xs text-muted">Selected send date</p>
          <p className="text-sm font-semibold text-ink">
            {formatCalendarDate(value)}
            {selectedDiffDays !== null && (
              <span className="ml-1.5 text-xs font-normal text-muted">
                {selectedDiffDays === 0
                  ? "(Today)"
                  : selectedDiffDays === 1
                    ? "(Tomorrow)"
                    : selectedDiffDays > 1
                      ? `(in ${selectedDiffDays} days)`
                      : "(past date)"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label htmlFor="calendar-native-input" className="sr-only">
            Pick date manually
          </label>
          <input
            id="calendar-native-input"
            type="date"
            min={effectiveMin}
            value={value}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
            className="field !h-8 !py-1 !text-xs !w-auto max-w-full font-mono cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
