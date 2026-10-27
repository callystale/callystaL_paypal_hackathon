"use client";

import { useMemo, useState } from "react";
import { api, type PurchaseDTO, type SettingsDTO, type SummaryDTO } from "@/lib/client";
import { formatCurrency } from "@/lib/money";
import { Modal, Money } from "./ui";
import { addDays, addMonths, dayKey, ordinal, periodHeading, periodStart } from "@/lib/period";

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
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const start = periodStart(anchor, startDay);
  const periodEnd = addMonths(start, 1, startDay);
  const currentStart = periodStart(today, startDay);
  const heading = periodHeading(start, currentStart, startDay);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let d = start; d < periodEnd; d = addDays(d, 1)) list.push(d);
    return list;
  }, [start, periodEnd]);

  const spentByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of purchases) {
      const key = dayKey(new Date(p.occurredAt));
      map.set(key, (map.get(key) ?? 0) + p.amount);
    }
    return map;
  }, [purchases]);

  const purchasesByDay = useMemo(() => {
    const map = new Map<string, PurchaseDTO[]>();
    for (const p of purchases) {
      const key = dayKey(new Date(p.occurredAt));
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
    }
    return map;
  }, [purchases]);

  const selectedPurchases = selectedDay
    ? purchasesByDay.get(dayKey(selectedDay)) ?? []
    : [];
  const selectedTotal = selectedPurchases.reduce((sum, p) => sum + p.amount, 0);

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
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="text-xs text-slate-400">
            {shortDate(start, start.getFullYear() !== today.getFullYear())} –{" "}
            {shortDate(addDays(periodEnd, -1), start.getFullYear() !== today.getFullYear())}
            {" · "}
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
            title="Jump to this month"
          >
            This month
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
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(d)}
              aria-label={`${shortDate(d, true)}: ${
                spent > 0 ? `${formatCurrency(spent, currencyCode)} spent` : "no spending"
              }`}
              className={`flex min-h-[64px] w-full flex-col rounded-lg border p-1.5 text-left transition hover:border-slate-500 ${
                isToday ? "border-brand-400 ring-1 ring-brand-500/40" : "border-slate-800"
              }`}
              style={
                spent > 0
                  ? { backgroundColor: `rgba(99, 102, 241, ${0.1 + intensity * 0.35})` }
                  : undefined
              }
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
            </button>
          );
        })}
      </div>

      <Modal
        open={selectedDay != null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Spending · ${shortDate(selectedDay, true)}` : "Spending"}
        dim={false}
        draggable
      >
        {selectedPurchases.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
            No purchases recorded on this day.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-slate-400">
                {selectedPurchases.length} purchase
                {selectedPurchases.length === 1 ? "" : "s"}
              </span>
              <span className="text-lg font-semibold">
                <Money amount={selectedTotal} currency={currencyCode} />
              </span>
            </div>
            <ul className="divide-y divide-slate-800">
              {selectedPurchases.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.description}</p>
                    <p className="truncate text-xs text-slate-400">
                      {new Date(p.occurredAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {p.merchant ? ` · ${p.merchant}` : ""}
                      {` · ${p.categoryName ?? "Uncategorized"}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    <Money amount={p.amount} currency={currencyCode} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </section>
  );
}
