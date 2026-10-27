"use client";

import { useState } from "react";
import type { CaptureResponse, ItemDTO, MilestoneDTO } from "@/lib/client";
import { PERIOD_CURRENT } from "@/lib/period";
import { usePlannerData } from "./usePlannerData";
import { StatusBar } from "./StatusBar";
import { IncomePanel } from "./IncomePanel";
import { BudgetPanel } from "./BudgetPanel";
import { PurchasesPanel } from "./PurchasesPanel";
import { CalendarPanel } from "./CalendarPanel";
import { WishlistPanel } from "./WishlistPanel";
import { PlanPanel } from "./PlanPanel";
import { AlternativesModal } from "./AlternativesModal";
import { CheckoutModal } from "./CheckoutModal";
import { Alert, Money, Spinner } from "./ui";

export function Dashboard() {
  // Every step opens on the current month; each panel can be switched to the
  // previous month independently (Step 2 has its own spending period).
  const [budgetPeriod, setBudgetPeriod] = useState<number>(PERIOD_CURRENT);
  const [spendingPeriod, setSpendingPeriod] = useState<number>(PERIOD_CURRENT);

  const { status, summary, settings, purchases, items, plan, loading, error, refresh, run } =
    usePlannerData(budgetPeriod);
  const [alternativesFor, setAlternativesFor] = useState<ItemDTO | null>(null);
  const [checkoutFor, setCheckoutFor] = useState<MilestoneDTO | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handlePaid = async (result: CaptureResponse) => {
    setToast(
      `Payment ${result.status.toLowerCase()}${result.captureId ? ` (${result.captureId})` : ""}.`,
    );
    const paidId = result.milestoneId;
    await refresh();
    if (paidId) setCheckoutFor(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400">
        <Spinner /> Loading your budget…
      </div>
    );
  }

  const currencyCode = summary?.currency ?? "USD";
  const periodShort = summary
    ? new Date(summary.periodStart).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Budget Planner
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Set up your monthly budget, record spending, and let a locally-run AI stage your wishlist
          into affordable milestones. The AI recommends — you approve and pay with PayPal.
        </p>
        <div className="mt-4">
          <StatusBar status={status} />
        </div>
      </header>

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {toast && (
        <div className="mb-6">
          <Alert kind="info">
            <span className="flex items-center justify-between gap-4">
              {toast}
              <button className="underline" onClick={() => setToast(null)}>
                dismiss
              </button>
            </span>
          </Alert>
        </div>
      )}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={`Budget · ${periodShort}`} value={<Money amount={summary.totals.budget} currency={currencyCode} />} />
          <Stat label={`Spent · ${periodShort}`} value={<Money amount={summary.totals.spent} currency={currencyCode} />} />
          <Stat
            label={`Remaining · ${periodShort}`}
            value={<Money amount={summary.totals.remaining} currency={currencyCode} />}
            tone={summary.totals.remaining < 0 ? "danger" : "ok"}
          />
          <Stat
            label="Wishlist items"
            value={`${summary.items.total - summary.items.purchased} open`}
          />
        </div>
      )}

      <div className="mb-6">
        <CalendarPanel
          purchases={purchases}
          settings={settings}
          summary={summary}
          run={run}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <IncomePanel
          settings={settings}
          summary={summary}
          run={run}
          period={budgetPeriod}
          onPeriodChange={setBudgetPeriod}
        />
        <PurchasesPanel
          purchases={purchases}
          settings={settings}
          summary={summary}
          run={run}
          period={spendingPeriod}
          onPeriodChange={setSpendingPeriod}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BudgetPanel
          summary={summary}
          run={run}
          period={budgetPeriod}
          onPeriodChange={setBudgetPeriod}
        />
        <WishlistPanel
          items={items}
          summary={summary}
          plan={plan}
          run={run}
          onFindAlternatives={setAlternativesFor}
          period={budgetPeriod}
          onPeriodChange={setBudgetPeriod}
        />
      </div>

      <div className="mt-6">
        <PlanPanel
          plan={plan}
          status={status}
          summary={summary}
          run={run}
          onCheckout={setCheckoutFor}
          period={budgetPeriod}
          onPeriodChange={setBudgetPeriod}
        />
      </div>

      <AlternativesModal
        item={alternativesFor}
        summary={summary}
        run={run}
        onClose={() => setAlternativesFor(null)}
      />
      <CheckoutModal
        milestone={checkoutFor}
        status={status}
        summary={summary}
        onClose={() => setCheckoutFor(null)}
        onPaid={handlePaid}
      />

      <footer className="mt-10 border-t border-slate-700 pt-4 text-xs text-slate-400">
        Local AI via Ollama · Product search via Channel3 (optional) · Payments via PayPal Sandbox
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="card py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "danger" ? "text-rose-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}
