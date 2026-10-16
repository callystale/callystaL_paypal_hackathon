"use client";

import { useState } from "react";
import { api, type ItemDTO, type SummaryDTO } from "@/lib/client";
import { EmptyState, Money, PriorityBadge } from "./ui";

export function WishlistPanel({
  items,
  summary,
  run,
  onFindAlternatives,
}: {
  items: ItemDTO[];
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onFindAlternatives: (item: ItemDTO) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [targetDate, setTargetDate] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const currencyCode = summary?.currency ?? "USD";
  const wishlist = items.filter((i) => !i.purchased);

  const addItem = async () => {
    if (!name.trim() || !price) return;
    setBusy(true);
    await run(() =>
      api.post("/api/items", {
        name: name.trim(),
        targetPrice: Number(price),
        priority,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
        category: category.trim() || null,
      }),
    );
    setName("");
    setPrice("");
    setTargetDate("");
    setCategory("");
    setPriority("MEDIUM");
    setBusy(false);
  };

  return (
    <section className="card">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Step 4 · Purchase plan
        </p>
        <h2 className="text-lg font-semibold">Desired items</h2>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          className="input col-span-2 sm:col-span-2"
          placeholder="Item to buy later"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          placeholder="Max price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="HIGH">High priority</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <input
          className="input"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <input
          className="input"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <button
          className="btn-primary col-span-2 sm:col-span-6"
          onClick={addItem}
          disabled={busy || !name || !price}
        >
          Add to wishlist
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {wishlist.length === 0 && (
          <li className="pt-2">
            <EmptyState>Nothing on the wishlist yet.</EmptyState>
          </li>
        )}
        {wishlist.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {item.name}
                <PriorityBadge priority={item.priority} />
                {item.milestoneId && (
                  <span className="badge bg-brand-50 text-brand-700">in plan</span>
                )}
              </p>
              <p className="truncate text-xs text-slate-400">
                target <Money amount={item.targetPrice} currency={currencyCode} />
                {item.category ? ` · ${item.category}` : ""}
                {item.targetDate
                  ? ` · by ${new Date(item.targetDate).toLocaleDateString()}`
                  : ""}
              </p>
              {item.alternativeName && (
                <p className="mt-0.5 text-xs text-emerald-600">
                  ↔ swapped to {item.alternativeName} (<Money amount={item.alternativePrice ?? 0} currency={currencyCode} />)
                  <button
                    className="ml-2 underline"
                    onClick={() => run(() => api.patch(`/api/items/${item.id}`, { alternative: null }))}
                  >
                    revert
                  </button>
                </p>
              )}
            </div>
            <span className="text-sm font-semibold">
              <Money amount={item.effectivePrice} currency={currencyCode} />
            </span>
            <button className="btn-secondary" onClick={() => onFindAlternatives(item)}>
              Find cheaper
            </button>
            <button
              className="btn-ghost px-1"
              title="Remove"
              onClick={() => run(() => api.delete(`/api/items/${item.id}`))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
