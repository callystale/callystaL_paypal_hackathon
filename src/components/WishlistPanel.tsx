"use client";

import { useState } from "react";
import { api, type ItemDTO, type SummaryDTO } from "@/lib/client";
import { periodLabel } from "@/lib/period";
import { PeriodFilter } from "./PeriodFilter";
import { EditItemModal, type ItemEditPatch } from "./EditItemModal";
import { EmptyState, Money, PriorityBadge } from "./ui";
import { WhatIfModal } from "./WhatIfModal";

const AI_CATEGORY = "__ai__";

export function WishlistPanel({
  items,
  summary,
  run,
  refresh,
  onFindAlternatives,
  period,
  onPeriodChange,
}: {
  items: ItemDTO[];
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  onFindAlternatives: (item: ItemDTO) => void;
  period: number;
  onPeriodChange: (period: number) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [targetDate, setTargetDate] = useState("");
  const [category, setCategory] = useState(AI_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [whatIfFor, setWhatIfFor] = useState<ItemDTO | null>(null);
  const [editing, setEditing] = useState<ItemDTO | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [addingToPlan, setAddingToPlan] = useState(false);

  const currencyCode = summary?.currency ?? "USD";
  const wishlist = items.filter((i) => !i.purchased);

  const addItem = async () => {
    if (!name.trim() || !price) return;
    setBusy(true);
    try {
      await run(() =>
        api.post("/api/items", {
          name: name.trim(),
          targetPrice: Number(price),
          priority,
          targetDate: targetDate ? new Date(targetDate).toISOString() : null,
          category: category === AI_CATEGORY ? null : category || null,
          autoCategorize: category === AI_CATEGORY,
        }),
      );
      setName("");
      setPrice("");
      setTargetDate("");
      setCategory(AI_CATEGORY);
      setPriority("MEDIUM");
    } finally {
      setBusy(false);
    }
  };

  const addToPlan = async () => {
    if (!whatIfFor) return;
    setAddingToPlan(true);
    await run(() => api.post(`/api/plan?offset=${period}`));
    setAddingToPlan(false);
    setWhatIfFor(null);
  };

  const saveEdit = async (patch: ItemEditPatch) => {
    if (!editing) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.patch(`/api/items/${editing.id}`, patch);
      await refresh();
      setEditing(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not save item");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <section className="card">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-400">
            Step 4 · Purchase plan
          </p>
          <h2 className="text-lg font-semibold">Desired items</h2>
          {summary && (
            <p className="text-xs text-slate-400">
              <Money amount={summary.totals.remaining} currency={currencyCode} /> left in{" "}
              {periodLabel(new Date(summary.periodStart), new Date(summary.periodEnd))}
            </p>
          )}
        </div>
        <PeriodFilter
          value={period}
          onChange={onPeriodChange}
          startDay={summary?.monthStartDay ?? 1}
          label="Budget month"
        />
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <input
          className="input col-span-2"
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
        <select
          className="input"
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value={AI_CATEGORY}>✨ Let AI label it</option>
          <option value="">No category</option>
          {summary?.categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary col-span-2"
          onClick={addItem}
          disabled={busy || !name || !price}
        >
          Add to wishlist
        </button>
      </div>

      <ul className="divide-y divide-slate-800">
        {wishlist.length === 0 && (
          <li className="pt-2">
            <EmptyState>Nothing on the wishlist yet.</EmptyState>
          </li>
        )}
        {wishlist.map((item) => (
          <li key={item.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0">
                    <PriorityBadge priority={item.priority} />
                  </span>
                  {item.milestoneId && (
                    <span className="badge shrink-0 bg-brand-500/20 text-brand-300">
                      planned
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                  <select
                    className="rounded-md border border-slate-700 bg-slate-950/60 px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-brand-400"
                    aria-label={`Category for ${item.name}`}
                    title="Change label"
                    value={item.category ?? ""}
                    onChange={(e) =>
                      run(() =>
                        api.patch(`/api/items/${item.id}`, {
                          category: e.target.value || null,
                        }),
                      )
                    }
                  >
                    <option value="">No category</option>
                    {item.category &&
                      !summary?.categories.some((c) => c.name === item.category) && (
                        <option value={item.category}>{item.category}</option>
                      )}
                    {summary?.categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {item.targetDate && (
                    <span>by {new Date(item.targetDate).toLocaleDateString()}</span>
                  )}
                </div>
                {item.alternativeName && (
                  <p className="mt-1 text-xs text-emerald-400">
                    ↔ swapped to {item.alternativeName} (
                    <Money amount={item.alternativePrice ?? 0} currency={currencyCode} />)
                    <button
                      className="ml-2 underline"
                      onClick={() =>
                        run(() => api.patch(`/api/items/${item.id}`, { alternative: null }))
                      }
                    >
                      revert
                    </button>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold">
                  <Money amount={item.effectivePrice} currency={currencyCode} />
                </span>
                {item.alternativeName && (
                  <span className="text-[11px] text-slate-500 line-through">
                    <Money amount={item.targetPrice} currency={currencyCode} />
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditError(null);
                  setEditing(item);
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-sm border border-brand-500/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20"
                onClick={() => setWhatIfFor(item)}
              >
                What if I buy now?
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onFindAlternatives(item)}
              >
                Find cheaper
              </button>
              <button
                className="btn-ghost px-1"
                title="Remove"
                onClick={() => run(() => api.delete(`/api/items/${item.id}`))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <WhatIfModal
        item={whatIfFor}
        summary={summary}
        adding={addingToPlan}
        onClose={() => setWhatIfFor(null)}
        onAddToPlan={addToPlan}
      />

      <EditItemModal
        item={editing}
        summary={summary}
        saving={savingEdit}
        error={editError}
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
        onSave={saveEdit}
      />
    </section>
  );
}
