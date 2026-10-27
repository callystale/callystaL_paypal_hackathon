"use client";

import {
  periodBounds,
  periodLabel,
  PERIOD_CURRENT,
  PERIOD_PREVIOUS,
} from "@/lib/period";

/**
 * Month selector shared by the steps. Values are offsets from the period
 * containing today: 0 = current month, -1 = previous month.
 */
export function PeriodFilter({
  value,
  onChange,
  startDay = 1,
  label = "Month",
  className = "",
}: {
  value: number;
  onChange: (offset: number) => void;
  startDay?: number;
  label?: string;
  className?: string;
}) {
  const now = new Date();
  const current = periodBounds(now, startDay, PERIOD_CURRENT);
  const previous = periodBounds(now, startDay, PERIOD_PREVIOUS);

  return (
    <label className={`flex items-center gap-2 text-xs text-slate-400 ${className}`}>
      <span className="whitespace-nowrap">{label}</span>
      <select
        className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 outline-none focus:border-brand-400"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} filter`}
      >
        <option value={PERIOD_CURRENT}>
          Current · {periodLabel(current.start, current.end)}
        </option>
        <option value={PERIOD_PREVIOUS}>
          Previous · {periodLabel(previous.start, previous.end)}
        </option>
      </select>
    </label>
  );
}
