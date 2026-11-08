"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  type ItemDTO,
  type Priority,
  type SummaryDTO,
} from "@/lib/client";
import { Alert, Modal, Money, Spinner } from "./ui";

export interface ItemEditPatch {
  name: string;
  targetPrice: number;
  priority: Priority;
  targetDate: string | null;
  category: string | null;
  notes: string | null;
  alternative?: null;
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function EditItemModal({
  item,
  summary,
  saving,
  error,
  onClose,
  onSave,
}: {
  item: ItemDTO | null;
  summary: SummaryDTO | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: ItemEditPatch) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [targetDate, setTargetDate] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [clearAlternative, setClearAlternative] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setPrice(String(item.targetPrice));
    setPriority(item.priority);
    setTargetDate(toDateInput(item.targetDate));
    setCategory(item.category ?? "");
    setNotes(item.notes ?? "");
    setClearAlternative(false);
  }, [item]);

  const currency = summary?.currency ?? "USD";
  const knownCategories = summary?.categories.map((entry) => entry.name) ?? [];
  const extraCategory =
    item?.category && !knownCategories.includes(item.category) ? item.category : null;
  const numericPrice = Number(price);
  const canSave = name.trim().length > 0 && Number.isFinite(numericPrice) && numericPrice > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || !canSave) return;

    const patch: ItemEditPatch = {
      name: name.trim(),
      targetPrice: numericPrice,
      priority,
      targetDate: targetDate
        ? new Date(`${targetDate}T12:00:00`).toISOString()
        : null,
      category: category.trim() || null,
      notes: notes.trim() || null,
    };
    if (clearAlternative) patch.alternative = null;
    onSave(patch);
  };

  return (
    <Modal open={item != null} onClose={onClose} title="Edit item">
      {item && (
        <form onSubmit={submit} className="space-y-4">
          {item.milestoneId && (
            <Alert kind="info">
              This item is already in your staged plan. Saving updates the item and the
              milestone totals. Regenerate the plan in Step 5 if the price change should
              rebalance the milestones.
            </Alert>
          )}

          {error && <Alert>{error}</Alert>}

          <div>
            <label className="label" htmlFor="edit-item-name">
              Name
            </label>
            <input
              id="edit-item-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-item-price">
                Target price
              </label>
              <input
                id="edit-item-price"
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="edit-item-priority">
                Priority
              </label>
              <select
                id="edit-item-priority"
                className="input"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                <option value="HIGH">High priority</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-item-date">
                Target date
              </label>
              <input
                id="edit-item-date"
                className="input"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="edit-item-category">
                Category
              </label>
              <select
                id="edit-item-category"
                className="input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">No category</option>
                {extraCategory && <option value={extraCategory}>{extraCategory}</option>}
                {summary?.categories.map((entry) => (
                  <option key={entry.id} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="edit-item-notes">
              Notes
            </label>
            <textarea
              id="edit-item-notes"
              className="input min-h-[72px] resize-y"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              placeholder="Optional details, model, size, link, etc."
            />
          </div>

          {item.alternativeName && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700">
              <p>
                Your plan currently uses the alternative{" "}
                <span className="font-semibold">{item.alternativeName}</span> at{" "}
                <Money
                  amount={item.alternativePrice ?? 0}
                  currency={currency}
                  className="font-semibold"
                />
                . Editing the target price will not change the planned amount unless you
                remove the alternative.
              </p>
              <label className="mt-2 flex items-center gap-2 text-amber-700">
                <input
                  type="checkbox"
                  checked={clearAlternative}
                  onChange={(event) => setClearAlternative(event.target.checked)}
                />
                Remove the alternative and use my target price
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-paper-line pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !canSave}>
              {saving ? <Spinner /> : null}
              Save changes
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
