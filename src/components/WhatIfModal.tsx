"use client";

import { useEffect, useState } from "react";
import { api, type ItemDTO, type SummaryDTO } from "@/lib/client";
import type { WhatIfResponse, WhatIfVerdict } from "@/lib/whatif";
import { Alert, Modal, Money, Spinner } from "./ui";

const VERDICT_STYLES: Record<
  WhatIfVerdict,
  { card: string; badge: string; text: string; label: string }
> = {
  buy: {
    card: "border-emerald-500/30 bg-emerald-500/10",
    badge: "bg-emerald-500/20 text-emerald-300",
    text: "text-emerald-300",
    label: "Buy now",
  },
  wait: {
    card: "border-amber-500/30 bg-amber-500/10",
    badge: "bg-amber-500/20 text-amber-300",
    text: "text-amber-300",
    label: "Wait",
  },
  avoid: {
    card: "border-rose-500/30 bg-rose-500/10",
    badge: "bg-rose-500/20 text-rose-300",
    text: "text-rose-300",
    label: "Avoid for now",
  },
};

function AfterBudget({
  label,
  name,
  spent,
  budget,
  after,
  currency,
  emptyLabel = "No cap set",
}: {
  label: string;
  name?: string;
  spent: number;
  budget: number | null;
  after: number | null;
  currency: string;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-paper-line bg-paper-base/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      {name && <p className="mt-0.5 text-sm font-medium">{name}</p>}
      {budget == null ? (
        <>
          <p className="mt-0.5 text-sm text-ink-muted">{emptyLabel}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            <Money amount={spent} currency={currency} /> spent
          </p>
        </>
      ) : after == null ? (
        <>
          <p className="mt-0.5 text-sm text-ink-muted">No budget set</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            <Money amount={spent} currency={currency} /> spent
          </p>
        </>
      ) : (
        <>
          <p
            className={`mt-0.5 text-sm font-semibold ${
              after < 0 ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {after < 0 ? (
              <>
                Over by <Money amount={Math.abs(after)} currency={currency} />
              </>
            ) : (
              <>
                <Money amount={after} currency={currency} /> left after
              </>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            <Money amount={spent} currency={currency} /> of{" "}
            <Money amount={budget} currency={currency} /> spent
          </p>
        </>
      )}
    </div>
  );
}

export function WhatIfModal({
  item,
  summary,
  adding,
  onClose,
  onAddToPlan,
}: {
  item: ItemDTO | null;
  summary: SummaryDTO | null;
  adding: boolean;
  onClose: () => void;
  onAddToPlan: () => void;
}) {
  const [data, setData] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!item) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);

    api
      .post<WhatIfResponse>("/api/what-if", { itemId: item.id })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not analyze this purchase",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, attempt]);

  const currency = data?.context.period.currency ?? summary?.currency ?? "USD";
  const price = data?.context.item.price ?? item?.effectivePrice ?? 0;

  const targetDate = item?.targetDate ? new Date(item.targetDate) : null;
  const daysUntil = targetDate
    ? Math.ceil((targetDate.getTime() - Date.now()) / 86_400_000)
    : null;
  const monthsUntil =
    daysUntil != null && daysUntil > 0 ? Math.max(1, Math.ceil(daysUntil / 30.44)) : null;
  const monthlySetAside = monthsUntil != null ? price / monthsUntil : null;

  const assessment = data?.assessment;
  const context = data?.context;
  const style = VERDICT_STYLES[assessment?.verdict ?? "wait"];
  const overallAfter = context?.overall.remainingAfter ?? null;

  return (
    <Modal open={item != null} onClose={onClose} title="What if I buy this now?" wide>
      {item && (
        <>
          <div className="mb-4 rounded-xl border border-paper-line bg-paper-base/40 p-3">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-xs text-ink-muted">
              Buying now costs{" "}
              <Money amount={price} currency={currency} className="text-ink-soft" />.
            </p>
            {context && (
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {data?.preRecorded ? "Based on the recorded sample period:" : "Based on the current period:"} {context.period.label}
              </p>
            )}
          </div>

          {data?.preRecorded && <p className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs text-cyan-100" role="note">
            <strong>Pre-recorded AI response · Live AI is off</strong><br />
            Generated locally with {data.preRecorded.model} on {data.preRecorded.capturedAt.slice(0, 10)} for the original sample budget and item price. Changes made in this demo do not update this assessment.
          </p>}
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-muted">
              <Spinner />
              Checking your overall and category budgets…
            </div>
          ) : error ? (
            <div className="space-y-3">
              <Alert>{error}</Alert>
              <div className="flex justify-end">
                <button
                  className="btn-secondary"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            </div>
          ) : data && assessment && context ? (
            <>
              <div className={`mb-4 rounded-xl border px-3 py-3 ${style.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`badge ${style.badge}`}>{style.label}</span>
                  <span className="text-[11px] uppercase tracking-wide text-ink-muted">
                    {assessment.source === "ollama" ? "AI assessment" : "Local assessment"}
                  </span>
                </div>
                <p className={`mt-2 text-base font-semibold ${style.text}`}>
                  {assessment.headline}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {assessment.summary}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <AfterBudget
                    label="Overall budget"
                    spent={context.overall.spent}
                    budget={
                      context.overall.hasBudget ? context.overall.budget : null
                    }
                    after={context.overall.remainingAfter}
                    currency={currency}
                    emptyLabel="No budget set"
                  />
                  {context.category ? (
                    <AfterBudget
                      label="Category budget"
                      name={context.category.name}
                      spent={context.category.spent}
                      budget={context.category.budget}
                      after={context.category.remainingAfter}
                      currency={currency}
                    />
                  ) : (
                    <div className="rounded-lg border border-paper-line bg-paper-base/40 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                        Category budget
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {context.item.category
                          ? `No budget category matches "${context.item.category}"`
                          : "No category set"}
                      </p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-ink-muted">
                  {assessment.source === "ollama"
                    ? "AI narrative only; all figures are calculated locally."
                    : "All figures are calculated locally."}
                </p>
              </div>

              <div className="mb-4">
                <p className="label">What this changes</p>
                <ul className="space-y-1.5 text-sm text-ink-soft">
                  {assessment.factors.map((factor, index) => (
                    <li key={`${index}-${factor}`} className="flex gap-2">
                      <span className="text-brand-400" aria-hidden="true">
                        •
                      </span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-paper-line bg-paper-base/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Buy now
                  </p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-muted">Pay today</dt>
                      <dd>
                        <Money amount={price} currency={currency} />
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-muted">Overall left after</dt>
                      <dd
                        className={
                          overallAfter != null && overallAfter < 0
                            ? "text-rose-300"
                            : ""
                        }
                      >
                        {overallAfter != null ? (
                          <Money amount={overallAfter} currency={currency} />
                        ) : (
                          "No budget"
                        )}
                      </dd>
                    </div>
                    {context.category?.remainingAfter != null && (
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-muted">
                          {context.category.name} left after
                        </dt>
                        <dd
                          className={
                            context.category.remainingAfter < 0
                              ? "text-rose-300"
                              : ""
                          }
                        >
                          <Money
                            amount={context.category.remainingAfter}
                            currency={currency}
                          />
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-2 text-xs text-ink-muted">
                    {assessment.recommendation}
                  </p>
                </div>

                <div className="rounded-xl border border-paper-line bg-paper-base/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Save until target date
                  </p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-muted">When</dt>
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
                      <dt className="text-ink-muted">Overall left</dt>
                      <dd>
                        {context.overall.remaining != null ? (
                          <Money
                            amount={context.overall.remaining}
                            currency={currency}
                          />
                        ) : (
                          "No budget"
                        )}
                      </dd>
                    </div>
                    {monthlySetAside != null ? (
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-ink-muted">Set aside</dt>
                        <dd className="text-right">
                          <Money amount={monthlySetAside} currency={currency} />
                          <span className="text-xs text-ink-muted">/mo</span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="mt-2 text-xs text-ink-muted">
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
                {context.milestones.atRisk.length > 0 ? (
                  <ul className="divide-y divide-paper-line overflow-hidden rounded-xl border border-paper-line">
                    {context.milestones.atRisk.map((milestone) => (
                      <li key={milestone.id} className="px-3 py-2 text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{milestone.title}</span>
                          <Money amount={milestone.total} currency={currency} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {milestone.items.join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : context.milestones.hasPlan ? (
                  <p className="text-sm text-ink-muted">
                    No planned purchases would be affected.
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No staged plan yet. Generate one in Step 5 and it will account for the
                    remaining budget.
                  </p>
                )}
                {overallAfter != null && overallAfter < 0 && (
                  <p className="mt-2 text-xs text-rose-300">
                    <Money amount={Math.abs(overallAfter)} currency={currency} /> would need
                    to come from next period&apos;s plan to buy this now.
                  </p>
                )}
              </div>
            </>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-paper-line pt-4">
            <button className="btn-secondary" onClick={onClose}>
              Keep as preview
            </button>
            <button className="btn-primary" onClick={onAddToPlan} disabled={adding}>
              {adding ? <Spinner /> : null}
              {item.milestoneId ? "Update plan" : "Add to plan"}
            </button>
          </div>
          <p className="mt-2 text-right text-[11px] text-ink-muted">
            Nothing changes until you confirm. This refreshes your staged plan in Step 5.
          </p>
        </>
      )}
    </Modal>
  );
}
