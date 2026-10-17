"use client";

import { useMemo, useState } from "react";
import { api, type PurchaseDTO, type SettingsDTO, type SummaryDTO } from "@/lib/client";
import { Money } from "./ui";
import { addDays, addMonths, dayKey, ordinal, periodStart } from "@/lib/period";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shortDate(date: Date, withYear: boolean): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function CalendarPanel({
  purchases,
  settings,
  summary,
  run,
}: {
  purchases: PurchaseDTO[];
  settings: SettingsDTO | null;
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const startDay = settings?.monthStartDay ?? 1;
  const currencyCode = summary?.currency ?? "USD";
  const today = new Date();

  // Any date inside the period currently being viewed; the period is derived
  // from it using the configured start day.
  const [anchor, setAnchor] = useState<Date>(() => periodStart(new Date(), startDay));

  const start = periodStart(anchor, startDay);
  const nextStart = addMonths(start, 1, startDay);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let d = start; d < nextStart; d = addDays(d, 1)) list.push(d);
    return list;
  }, [start, nextStart]);

  const spentByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of purchases) {
      const key = dayKey(new Date(p.occurredAt));
      map.set(key, (map.get(key) ?? 0) + p.amount);
    }
    return map;
  }, [purchases]);

  const periodTotal = days.reduce((sum, d) => sum + (spentByDay.get(dayKey(d)) ?? 0), 0);
  const maxDay = days.reduce((max, d) => Math.max(max, spentByDay.get(dayKey(d)) ?? 0), 0);
  const todayKey = dayKey(today);

  const leadingBlanks = start.getDay();

  const changeStartDay = async (value: string) => {
    const day = Number(value);
    if (!Number.isFinite(day)) return;
    await run(() => api.patch("/api/settings", { monthStartDay: day }));
  };

  return (
    <section className="card">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Spending calendar
          </p>
          <h2 className="text-lg font-semibold">
            {shortDate(start, start.getFullYear() !== today.getFullYear())} –{" "}
            {shortDate(addDays(nextStart, -1), start.getFullYear() !== today.getFullYear())}
          </h2>
          <p className="text-xs text-slate-400">
            {periodTotal > 0 ? (
              <>
                <Money amount={periodTotal} currency={currencyCode} /> spent this period
              </>
            ) : (
              "No spending recorded in this period yet."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Month starts on
            <select
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200"
              value={startDay}
              onChange={(e) => changeStartDay(e.target.value)}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setAnchor(addMonths(start, -1, startDay))}
            title="Previous period"
          >
            ‹
          </button>
          <button
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </button>
          <button
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setAnchor(addMonths(start, 1, startDay))}
            title="Next period"
          >
            ›
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => {
          const key = dayKey(d);
          const spent = spentByDay.get(key) ?? 0;
          const isToday = key === todayKey;
          const intensity = maxDay > 0 ? spent / maxDay : 0;
          return (
            <div
              key={key}
              className={`flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition ${
                isToday ? "border-brand-400 ring-1 ring-brand-500/40" : "border-slate-800"
              }`}
              style={
                spent > 0
                  ? { backgroundColor: `rgba(99, 102, 241, ${0.1 + intensity * 0.35})` }
                  : undefined
              }
              title={spent > 0 ? `${shortDate(d, true)} · ${spent.toFixed(2)}` : undefined}
            >
              <span
                className={`text-xs ${
                  isToday ? "font-semibold text-brand-300" : "text-slate-400"
                }`}
              >
                {d.getDate()}
              </span>
              {spent > 0 && (
                <span className="mt-auto truncate text-[11px] font-medium text-slate-200">
                  <Money amount={spent} currency={currencyCode} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
