"use client";

import type { ItemDTO, MilestoneDTO, PlanResponse, SummaryDTO } from "@/lib/client";
import { Modal, Money, Spinner } from "./ui";

function atRiskMilestones(
  plan: PlanResponse | null,
  item: ItemDTO,
  over: number,
): Array<{ milestone: MilestoneDTO; total: number }> {
  if (over <= 0) return [];

  let needed = over;
  const atRisk: Array<{ milestone: MilestoneDTO; total: number }> = [];
  const milestones = [...(plan?.milestones ?? [])].sort((a, b) => a.sequence - b.sequence);

  for (const milestone of milestones) {
    // The item is bought now, so its own cost no longer belongs to the plan.
    const total = milestone.items
      .filter((i) => i.id !== item.id)
      .reduce((sum, i) => sum + i.effectivePrice, 0);
    if (total <= 0) continue;

    atRisk.push({ milestone, total });
    needed -= total;
    if (needed <= 0) break;
  }

  return atRisk;
}

export function WhatIfModal({
  item,
  plan,
  summary,
  adding,
  onClose,
  onAddToPlan,
}: {
  item: ItemDTO | null;
  plan: PlanResponse | null;
  summary: SummaryDTO | null;
  adding: boolean;
  onClose: () => void;
  onAddToPlan: () => void;
}) {
  const currency = summary?.currency ?? "USD";
  const remaining = summary?.totals.remaining ?? 0;
  const price = item?.effectivePrice ?? 0;
  const remainingAfter = remaining - price;
  const over = Math.max(0, -remainingAfter);
  const fits = over === 0;

  const targetDate = item?.targetDate ? new Date(item.targetDate) : null;
  const daysUntil = targetDate
    ? Math.ceil((targetDate.getTime() - Date.now()) / 86_400_000)
    : null;
  const monthsUntil =
    daysUntil != null && daysUntil > 0 ? Math.max(1, Math.ceil(daysUntil / 30.44)) : null;
  const monthlySetAside = monthsUntil != null ? price / monthsUntil : null;

  const delayed = item ? atRiskMilestones(plan, item, over) : [];

  return (
    <Modal open={item != null} onClose={onClose} title="What if I buy this now?">
      {item && (
        <>
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-slate-400">
              Buying now costs{" "}
              <Money amount={price} currency={currency} className="text-slate-300" />.
            </p>
          </div>

          <div
            className={`mb-4 rounded-xl border px-3 py-2.5 ${
              fits
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                fits ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {fits ? "This fits in this month's budget." : "This is over budget."}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
              <span>
                Left this month: <Money amount={remaining} currency={currency} />
              </span>
              <span>
                After purchase:{" "}
                <Money
                  amount={remainingAfter}
                  currency={currency}
                  className={fits ? "text-emerald-300" : "text-rose-300"}
                />
              </span>
              {!fits && (
                <span className="text-rose-300">
                  Over by <Money amount={over} currency={currency} />
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Buy now
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Pay today</dt>
                  <dd>
                    <Money amount={price} currency={currency} />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Budget left</dt>
                  <dd>
                    <Money amount={remainingAfter} currency={currency} />
                  </dd>
                </div>
              </dl>
              <p
                className={`mt-2 text-xs ${fits ? "text-slate-400" : "text-rose-300"}`}
              >
                {fits ? "No planned purchases need to move." : "Future milestones may slip."}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Save until target date
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">When</dt>
                  <dd>
                    {targetDate
                      ? targetDate.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "No date set"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Budget left</dt>
                  <dd>
                    <Money amount={remaining} currency={currency} />
                  </dd>
                </div>
                {monthlySetAside != null ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-slate-400">Set aside</dt>
                    <dd className="text-right">
                      <Money amount={monthlySetAside} currency={currency} />
                      <span className="text-xs text-slate-500">/mo</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-xs text-slate-400">
                {targetDate
                  ? daysUntil != null && daysUntil > 0
                    ? `${daysUntil} day${daysUntil === 1 ? "" : "s"} to save before the target date.`
                    : daysUntil === 0
                      ? "The target date is today."
                      : "That target date has already passed."
                  : "Add a target date to compare a monthly set-aside."}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="label mb-2">Planned purchases at risk</h3>
            {fits ? (
              <p className="text-sm text-emerald-300">
                Nothing needs to be delayed — this stays within what&apos;s left this month.
              </p>
            ) : delayed.length > 0 ? (
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                {delayed.map(({ milestone, total }) => (
                  <li key={milestone.id} className="px-3 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{milestone.title}</span>
                      <Money amount={total} currency={currency} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {milestone.items
                        .filter((i) => i.id !== item.id)
                        .map((i) => i.name)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (plan?.milestones.length ?? 0) > 0 ? (
              <p className="text-sm text-slate-400">
                No other planned purchases would be affected.
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                No staged plan yet. Generate one in Step 5 and it will account for the
                remaining budget.
              </p>
            )}
            {!fits && (
              <p className="mt-2 text-xs text-slate-400">
                <Money amount={over} currency={currency} /> would need to come from next
                month&apos;s plan to buy this now.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4">
            <button className="btn-secondary" onClick={onClose}>
              Keep as preview
            </button>
            <button className="btn-primary" onClick={onAddToPlan} disabled={adding}>
              {adding ? <Spinner /> : null}
              {item.milestoneId ? "Update plan" : "Add to plan"}
            </button>
          </div>
          <p className="mt-2 text-right text-[11px] text-slate-500">
            Nothing changes until you confirm. This refreshes your staged plan in Step 5.
          </p>
        </>
      )}
    </Modal>
  );
}
