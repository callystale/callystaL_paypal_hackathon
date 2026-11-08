"use client";

import type { ReactNode } from "react";
import type { SpendingAnalysisResponse } from "@/lib/spending";
import { Alert, Modal, Money, Spinner } from "./ui";

function Stat({
  label,
  children,
  tone = "default",
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "negative"
      ? "text-rose-400"
      : tone === "positive"
        ? "text-emerald-400"
        : "text-ink";
  return (
    <div className="rounded-lg border border-paper-line bg-paper-inset/50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{children}</p>
    </div>
  );
}

export function SpendingAnalysisModal({
  open,
  loading,
  error,
  analysis,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  analysis: SpendingAnalysisResponse | null;
  onClose: () => void;
}) {
  const categories = analysis
    ? [...analysis.categories]
        .filter((category) => category.spent > 0)
        .sort((a, b) => b.spent - a.spent)
    : [];
  const hasBudget = analysis?.categories.some((category) => category.budget != null) ?? false;

  return (
    <Modal open={open} onClose={onClose} title="Spending analysis" wide>
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-muted">
          <Spinner />
          Analyzing all purchases from this month…
        </div>
      ) : error ? (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <p className="text-sm text-ink-muted">
            The analysis could not be generated. Your purchases and budgets were not changed.
          </p>
        </div>
      ) : analysis ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`badge ${
                analysis.source === "ollama"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {analysis.source === "ollama" ? "AI coach" : "Local analysis"}
            </span>
            <span className="text-xs text-ink-muted">
              {analysis.periodLabel} · {analysis.purchaseCount}{" "}
              {analysis.purchaseCount === 1 ? "purchase" : "purchases"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-ink">{analysis.summary}</p>

          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Spent">
              <Money amount={analysis.totals.spent} currency={analysis.currency} />
            </Stat>
            <Stat label="Budget">
              {hasBudget ? (
                <Money amount={analysis.totals.budget} currency={analysis.currency} />
              ) : (
                <span className="text-ink-muted">Not set</span>
              )}
            </Stat>
            <Stat
              label="Remaining"
              tone={
                !hasBudget
                  ? "default"
                  : analysis.totals.remaining < 0
                    ? "negative"
                    : "positive"
              }
            >
              {hasBudget ? (
                <Money amount={analysis.totals.remaining} currency={analysis.currency} />
              ) : (
                <span className="text-ink-muted">—</span>
              )}
            </Stat>
          </div>

          {analysis.totals.previousSpent > 0 && (
            <p className="-mt-2 text-xs text-ink-muted">
              Previous month:{" "}
              <Money amount={analysis.totals.previousSpent} currency={analysis.currency} /> spent.
            </p>
          )}

          {categories.length > 0 && (
            <div>
              <p className="label">Where it went</p>
              <ul className="max-h-60 space-y-3 overflow-y-auto pr-1">
                {categories.map((category) => (
                  <li key={category.name}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="truncate">{category.name}</span>
                      </span>
                      <span className="shrink-0 text-ink-soft">
                        <Money amount={category.spent} currency={analysis.currency} />
                        <span className="ml-2 text-xs text-ink-muted">
                          {Math.round(category.share * 100)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-inset">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, Math.round(category.share * 100))}%`,
                          backgroundColor: category.color,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="label">Insights</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              {analysis.insights.map((insight, index) => (
                <li key={`${index}-${insight}`} className="flex gap-2">
                  <span className="text-brand-400" aria-hidden="true">
                    •
                  </span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {analysis.coach && (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">
                Coach&apos;s take
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{analysis.coach}</p>
            </div>
          )}

          <p className="border-t border-paper-line pt-3 text-xs text-ink-muted">
            {analysis.source === "ollama"
              ? "Numbers computed locally from this month's purchases. Coaching note from the local model."
              : "Computed locally from this month's purchases."}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
