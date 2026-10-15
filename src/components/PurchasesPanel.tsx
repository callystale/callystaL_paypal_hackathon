"use client";

import { useMemo, useState } from "react";
import { api, type PurchaseDTO, type SummaryDTO } from "@/lib/client";
import { EmptyState, Money, Spinner } from "./ui";

export function PurchasesPanel({
  purchases,
  summary,
  run,
}: {
  purchases: PurchaseDTO[];
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);

  const currencyCode = summary?.currency ?? "USD";
  const categories = summary?.categories ?? [];

  const total = useMemo(
    () => purchases.reduce((sum, p) => sum + p.amount, 0),
    [purchases],
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
  };

  return (
    <section className="card">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Step 2 · Spending
          </p>
          <h2 className="text-lg font-semibold">Purchases</h2>
        </div>
        <div className="text-right text-sm text-slate-500">
          {purchases.length} recorded · <Money amount={total} currency={currencyCode} />
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
          placeholder="Merchant (optional)"
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

      <ul className="mt-4 divide-y divide-slate-100">
        {purchases.length === 0 && (
          <li className="pt-4">
            <EmptyState>No purchases yet. Record one above.</EmptyState>
          </li>
        )}
        {purchases.slice(0, 12).map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.description}</p>
              <p className="truncate text-xs text-slate-400">
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
              className="max-w-[9rem] rounded-md border border-slate-200 px-2 py-1 text-xs"
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
              title="Delete"
              onClick={() => run(() => api.delete(`/api/purchases/${p.id}`))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
