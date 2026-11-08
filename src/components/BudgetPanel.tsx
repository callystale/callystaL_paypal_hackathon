"use client";

import { api, type SummaryDTO } from "@/lib/client";
import { SpendingCharts } from "./CategoryCharts";
import { PeriodFilter } from "./PeriodFilter";
import { Money, Progress } from "./ui";

export function BudgetPanel({
  summary,
  run,
  period,
  onPeriodChange,
}: {
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  period: number;
  onPeriodChange: (period: number) => void;
}) {
  const currencyCode = summary?.currency ?? "USD";

  const updateBudget = async (id: string, value: string) => {
    await run(() =>
      api.patch(`/api/categories/${id}`, { budget: value === "" ? null : Number(value) }),
    );
  };

  return (
    <section id="categories" tabIndex={-1} className="card notebook-page">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Step 3 · Budget
          </p>
          <h2 className="text-lg font-semibold">Categories &amp; spending</h2>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PeriodFilter
            value={period}
            onChange={onPeriodChange}
            startDay={summary?.monthStartDay ?? 1}
            label="Budget month"
          />
          {summary && (
            <div className="text-right text-sm">
              <div className="font-semibold">
                <Money amount={summary.totals.spent} currency={currencyCode} /> spent
              </div>
              <div className="text-ink-muted">
                of <Money amount={summary.totals.budget} currency={currencyCode} /> budget
              </div>
            </div>
          )}
        </div>
      </header>

      {summary && (
        <SpendingCharts categories={summary.categories} currency={currencyCode} />
      )}

      <div className="divide-y divide-paper-line">
        {summary?.categories.map((c) => {
          const over = c.remaining != null && c.remaining < 0;
          return (
            <div key={c.id} className="group py-2 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate">{c.name}</span>
                  <span
                    className="shrink-0 text-[11px] font-normal text-ink-muted"
                    title={`${c.purchaseCount} purchase${c.purchaseCount === 1 ? "" : "s"}`}
                  >
                    {c.purchaseCount}×
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm">
                  <Money amount={c.spent} currency={currencyCode} />
                  <span className="text-ink-muted">/</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="no cap"
                    defaultValue={c.budget ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value;
                      if (String(c.budget ?? "") !== next) updateBudget(c.id, next);
                    }}
                    className="w-20 rounded-md border border-paper-line px-1.5 py-0.5 text-right text-xs outline-none focus:border-brand-400"
                  />
                  <button
                    className="btn-ghost invisible px-1 py-0.5 group-hover:visible"
                    title="Delete category"
                    onClick={() => run(() => api.delete(`/api/categories/${c.id}`))}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {c.budget != null && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Progress value={c.spent} max={c.budget} color={c.color} />
                  </div>
                  <span
                    className={`shrink-0 text-[11px] tabular-nums ${
                      over ? "text-rose-400" : "text-ink-muted"
                    }`}
                  >
                    <Money
                      amount={Math.abs(c.remaining ?? 0)}
                      currency={currencyCode}
                    />{" "}
                    {over ? "over" : "left"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {summary && summary.categories.length === 0 && (
          <p className="text-sm text-ink-muted">No categories yet. Add them in Step 1.</p>
        )}
      </div>
    </section>
  );
}
