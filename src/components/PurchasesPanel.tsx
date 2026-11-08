"use client";

import { useMemo, useState } from "react";
import { api, type PurchaseDTO, type SettingsDTO, type SummaryDTO } from "@/lib/client";
import { PERIOD_CURRENT, periodBounds, periodLabel } from "@/lib/period";
import { PeriodFilter } from "./PeriodFilter";
import { EmptyState, Money, Spinner } from "./ui";

const VISIBLE_LIMIT = 12;

interface EditDraft {
  id: string;
  description: string;
  amount: string;
  merchant: string;
  categoryId: string;
  occurredAt: string;
  // The category as it was when editing started, so saving a description/amount
  // fix doesn't relabel an AI-categorized row as "set by you".
  initialCategoryId: string;
  // The date (YYYY-MM-DD) as it was when editing started, so an untouched date
  // keeps its original time instead of being reset to midnight.
  initialOccurredAt: string;
}

/** Local YYYY-MM-DD for a <input type="date">. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function PurchasesPanel({
  purchases,
  settings,
  summary,
  run,
  period,
  onPeriodChange,
}: {
  purchases: PurchaseDTO[];
  settings: SettingsDTO | null;
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  period: number;
  onPeriodChange: (period: number) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [showAll, setShowAll] = useState(false);

  const currencyCode = summary?.currency ?? "USD";
  const categories = summary?.categories ?? [];
  const startDay = settings?.monthStartDay ?? 1;

  // Step 2 defaults to the current month but can be switched to the previous
  // one; the list and its totals only ever show the selected period.
  const { start, end } = useMemo(
    () => periodBounds(new Date(), startDay, period),
    [startDay, period],
  );

  const periodPurchases = useMemo(
    () =>
      purchases.filter((p) => {
        const time = new Date(p.occurredAt).getTime();
        return time >= start.getTime() && time < end.getTime();
      }),
    [purchases, start, end],
  );

  const total = useMemo(
    () => periodPurchases.reduce((sum, p) => sum + p.amount, 0),
    [periodPurchases],
  );

  const addPurchase = async () => {
    if (!description.trim() || !amount) return;
    setBusy(true);
    await run(() =>
      api.post("/api/purchases", {
        description: description.trim(),
        amount: Number(amount),
        merchant: merchant.trim() || null,
        categoryId: categoryId || null,
      }),
    );
    setDescription("");
    setAmount("");
    setMerchant("");
    setCategoryId("");
    setBusy(false);
    // New purchases are recorded today, so make sure the user can see it.
    if (period !== PERIOD_CURRENT) onPeriodChange(PERIOD_CURRENT);
  };

  const startEdit = (p: PurchaseDTO) => {
    const dateInput = toDateInput(p.occurredAt);
    setEditing({
      id: p.id,
      description: p.description,
      amount: String(p.amount),
      merchant: p.merchant ?? "",
      categoryId: p.categoryId ?? "",
      occurredAt: dateInput,
      initialCategoryId: p.categoryId ?? "",
      initialOccurredAt: dateInput,
    });
  };

  const patchEdit = (patch: Partial<EditDraft>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  const saveEdit = async () => {
    if (!editing) return;
    const draft = editing;
    if (!draft.description.trim() || !(Number(draft.amount) > 0)) return;
    // Keep the row open if the update fails so the edits aren't lost.
    let saved = true;
    await run(async () => {
      try {
        await api.patch(`/api/purchases/${draft.id}`, {
          description: draft.description.trim(),
          amount: Number(draft.amount),
          merchant: draft.merchant.trim() || null,
          // Only send the category when it actually changed, so saving a
          // description/amount fix keeps the original categorization source.
          ...(draft.categoryId !== draft.initialCategoryId
            ? { categoryId: draft.categoryId || null }
            : {}),
          // Only send the date when it changed; otherwise keep the original time.
          ...(draft.occurredAt && draft.occurredAt !== draft.initialOccurredAt
            ? { occurredAt: new Date(`${draft.occurredAt}T00:00:00`).toISOString() }
            : {}),
        });
      } catch (e) {
        saved = false;
        throw e;
      }
    });
    if (saved) setEditing(null);
  };

  const visible = showAll ? periodPurchases : periodPurchases.slice(0, VISIBLE_LIMIT);

  return (
    <section id="purchases" tabIndex={-1} className="card notebook-page">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Step 2 · Spending
          </p>
          <h2 className="text-lg font-semibold">Purchases</h2>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-sm text-ink-muted">
          <PeriodFilter
            value={period}
            onChange={onPeriodChange}
            startDay={startDay}
            label="Spending month"
          />
          <span>
            {periodPurchases.length} recorded in {periodLabel(start, end)} ·{" "}
            <Money amount={total} currency={currencyCode} />
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <input
            className="input"
            placeholder="What did you buy?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="input"
          placeholder="Store / merchant (optional)"
          title="Optional — helps the AI pick a category"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">✨ Let AI categorize</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={addPurchase} disabled={busy || !description || !amount}>
          {busy ? <Spinner /> : null} Record purchase
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Adding the store or merchant is optional — it just helps the AI categorize the purchase.
      </p>

      <ul className="mt-4 divide-y divide-paper-line">
        {periodPurchases.length === 0 && (
          <li className="pt-4">
            <EmptyState>
              No purchases recorded in {periodLabel(start, end)}.
            </EmptyState>
          </li>
        )}
        {visible.map((p) =>
          editing?.id === p.id ? (
            <li key={p.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input min-w-[10rem] flex-1"
                  placeholder="What did you buy?"
                  value={editing.description}
                  onChange={(e) => patchEdit({ description: e.target.value })}
                  autoFocus
                />
                <input
                  className="input w-24"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={editing.amount}
                  onChange={(e) => patchEdit({ amount: e.target.value })}
                />
                <input
                  className="input w-36"
                  placeholder="Store / merchant (optional)"
                  title="Optional — helps the AI pick a category"
                  value={editing.merchant}
                  onChange={(e) => patchEdit({ merchant: e.target.value })}
                />
                <input
                  className="input w-40"
                  type="date"
                  value={editing.occurredAt}
                  onChange={(e) => patchEdit({ occurredAt: e.target.value })}
                />
                <select
                  className="input w-40"
                  value={editing.categoryId}
                  onChange={(e) => patchEdit({ categoryId: e.target.value })}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary"
                  onClick={saveEdit}
                  disabled={!editing.description.trim() || !(Number(editing.amount) > 0)}
                >
                  Save
                </button>
                <button className="btn-secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.description}</p>
                <p className="truncate text-xs text-ink-muted">
                  {new Date(p.occurredAt).toLocaleDateString()}
                  {p.merchant ? ` · ${p.merchant}` : ""}
                  {p.userCategorized
                    ? " · set by you"
                    : p.aiConfidence != null
                      ? ` · AI ${Math.round(p.aiConfidence * 100)}%`
                      : ""}
                </p>
              </div>
              <select
                className="max-w-[9rem] rounded-md border border-paper-line px-2 py-1 text-xs"
                value={p.categoryId ?? ""}
                onChange={(e) =>
                  run(() =>
                    api.patch(`/api/purchases/${p.id}`, {
                      categoryId: e.target.value || null,
                    }),
                  )
                }
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="w-20 text-right text-sm font-medium">
                <Money amount={p.amount} currency={currencyCode} />
              </span>
              <button
                className="btn-ghost px-1"
                title="Edit purchase"
                onClick={() => startEdit(p)}
              >
                ✎
              </button>
              <button
                className="btn-ghost px-1"
                title="Delete"
                onClick={() => run(() => api.delete(`/api/purchases/${p.id}`))}
              >
                ✕
              </button>
            </li>
          ),
        )}
      </ul>

      {periodPurchases.length > VISIBLE_LIMIT && (
        <button
          className="btn-ghost mt-2 px-2 py-1 text-xs"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `Show all ${periodPurchases.length}`}
        </button>
      )}
    </section>
  );
}
