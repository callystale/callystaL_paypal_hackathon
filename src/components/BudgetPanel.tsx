"use client";

import { useState } from "react";
import { api, type SummaryDTO } from "@/lib/client";
import { Money, Progress } from "./ui";

const COLORS = ["#6366f1", "#22c55e", "#f97316", "#06b6d4", "#ec4899", "#8b5cf6", "#eab308"];

export function BudgetPanel({
  summary,
  run,
}: {
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  const currencyCode = summary?.currency ?? "USD";

  const addCategory = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await run(() =>
      api.post("/api/categories", {
        name: name.trim(),
        budget: budget ? Number(budget) : null,
        color: COLORS[(summary?.categories.length ?? 0) % COLORS.length],
      }),
    );
    setName("");
    setBudget("");
    setBusy(false);
  };

  const updateBudget = async (id: string, value: string) => {
    await run(() =>
      api.patch(`/api/categories/${id}`, { budget: value === "" ? null : Number(value) }),
    );
  };

  return (
    <section className="card">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Step 3 · Budget
          </p>
          <h2 className="text-lg font-semibold">Categories &amp; spending</h2>
        </div>
        {summary && (
          <div className="text-right text-sm">
            <div className="font-semibold">
              <Money amount={summary.totals.spent} currency={currencyCode} /> spent
            </div>
            <div className="text-slate-500">
              of <Money amount={summary.totals.budget} currency={currencyCode} /> budget
            </div>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-col gap-4">
        {summary?.categories.map((c) => (
          <div key={c.id} className="group">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
                <span className="text-xs font-normal text-slate-400">
                  {c.purchaseCount} purchase{c.purchaseCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Money amount={c.spent} currency={currencyCode} />
                <span className="text-slate-400">/</span>
                <input
                  type="number"
                  min="0"
                  placeholder="no cap"
                  defaultValue={c.budget ?? ""}
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (String(c.budget ?? "") !== next) updateBudget(c.id, next);
                  }}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-brand-500"
                />
                <button
                  className="btn-ghost invisible px-1 group-hover:visible"
                  title="Delete category"
                  onClick={() => run(() => api.delete(`/api/categories/${c.id}`))}
                >
                  ✕
                </button>
              </span>
            </div>
            {c.budget != null && (
              <>
                <Progress value={c.spent} max={c.budget} color={c.color} />
                <p className="mt-1 text-xs text-slate-500">
                  {c.remaining != null && c.remaining >= 0 ? (
                    <>
                      <Money amount={c.remaining} currency={currencyCode} /> left
                    </>
                  ) : (
                    <span className="text-rose-600">
                      <Money amount={Math.abs(c.remaining ?? 0)} currency={currencyCode} /> over budget
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
        ))}
        {summary && summary.categories.length === 0 && (
          <p className="text-sm text-slate-500">No categories yet. Add one below.</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <div className="flex-1">
          <label className="label">New category</label>
          <input
            className="input"
            placeholder="e.g. Travel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
          />
        </div>
        <div className="w-32">
          <label className="label">Budget</label>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="optional"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={addCategory} disabled={busy || !name.trim()}>
          Add
        </button>
      </div>
    </section>
  );
}
