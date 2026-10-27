import { formatCurrency, round2 } from "./money";
import { ollamaJson } from "./ollama";

export interface SpendingCategoryDTO {
  name: string;
  color: string;
  spent: number;
  budget: number | null;
  remaining: number | null;
  /** Fraction of this month's total spending (0-1). */
  share: number;
}

export interface SpendingPurchaseDTO {
  description: string;
  amount: number;
  merchant: string | null;
  categoryName: string | null;
  occurredAt: string;
}

export interface SpendingAnalysisInput {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  currency: string;
  totals: {
    budget: number;
    spent: number;
    remaining: number;
    /** Total spent in the previous period, for a month-over-month comparison. */
    previousSpent: number;
  };
  categories: SpendingCategoryDTO[];
  purchases: SpendingPurchaseDTO[];
  daysElapsed: number;
  daysRemaining: number;
}

export interface SpendingAnalysis {
  source: "ollama" | "heuristic";
  summary: string;
  insights: string[];
  /** Optional qualitative coaching note from the local model. */
  coach?: string | null;
}

export interface SpendingAnalysisResponse extends SpendingAnalysis {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  currency: string;
  totals: SpendingAnalysisInput["totals"];
  categories: SpendingCategoryDTO[];
  purchaseCount: number;
}

const MAX_INSIGHTS = 5;

function money(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

function buildCoachContext(input: SpendingAnalysisInput): string {
  const spentCategories = input.categories
    .filter((category) => category.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const top = spentCategories[0];
  const overBudget = input.categories.filter(
    (category) => category.remaining != null && category.remaining < 0,
  );
  const largest = [...input.purchases].sort((a, b) => b.amount - a.amount)[0];

  const facts: string[] = [];

  if (top) facts.push(`- The biggest spending category is ${top.name}.`);
  if (spentCategories[1]) {
    const others = spentCategories
      .slice(1, 4)
      .map((category) => category.name)
      .join(", ");
    facts.push(`- Other categories with spending: ${others}.`);
  }
  if (overBudget.length > 0) {
    facts.push(`- Over their category budget: ${overBudget.map((c) => c.name).join(", ")}.`);
  } else if (input.categories.some((category) => category.budget != null)) {
    facts.push("- Every category with a budget is within its limit.");
  }

  if (input.totals.previousSpent > 0) {
    const difference = input.totals.spent - input.totals.previousSpent;
    facts.push(
      difference < 0
        ? "- Spending is lower than the previous period."
        : difference > 0
          ? "- Spending is higher than the previous period."
          : "- Spending is about the same as the previous period.",
    );
  }

  if (input.totals.remaining < 0) {
    facts.push("- The overall budget has been exceeded.");
  } else if (input.totals.budget > 0) {
    facts.push("- There is still money available in the overall budget.");
  }

  if (largest) {
    facts.push(`- The largest single purchase was "${largest.description}".`);
  }
  if (input.categories.some((c) => c.name === "Uncategorized" && c.spent > 0)) {
    facts.push("- Some spending is uncategorized.");
  }

  return facts.join("\n");
}

const COACH_PROMPT =
  "You are a supportive personal finance coach. You receive qualitative facts " +
  "about the user's current-month spending. Write one or two short sentences of " +
  "practical behavioral advice that helps them improve next month. Focus only on " +
  "spending categories and overall habits; do not mention specific purchases, " +
  "items, or merchants. The facts intentionally contain no numbers; do not invent " +
  "or mention any numbers, amounts, percentages, or dates. Do not restate the facts. " +
  "Return strict JSON only.";

/**
 * Builds a deterministic analysis of the current period, then optionally asks
 * the local model for a short, number-free coaching note. All figures in the
 * response are computed locally so a small model cannot misstate the finances.
 */
export async function analyzeSpending(
  input: SpendingAnalysisInput,
): Promise<SpendingAnalysis> {
  const base = heuristicAnalysis(input);

  if (input.totals.spent <= 0 || input.purchases.length === 0) {
    return base;
  }

  try {
    const data = await ollamaJson<{ coach?: unknown }>(
      [
        { role: "system", content: COACH_PROMPT },
        {
          role: "user",
          content:
            `Qualitative facts:\n${buildCoachContext(input)}` +
            '\n\nReturn strict JSON: {"coach":"one or two sentences of advice with no numbers"}',
        },
      ],
      { temperature: 0.5, timeoutMs: 10_000 },
    );

    const coach =
      typeof data.coach === "string" ? data.coach.trim().slice(0, 320) : "";
    const lowerCoach = coach.toLowerCase();
    const mentionsPurchase = input.purchases.some((purchase) => {
      const description = purchase.description.trim().toLowerCase();
      return description.length >= 3 && lowerCoach.includes(description);
    });
    const mentionsMerchant = input.purchases.some((purchase) => {
      const merchant = purchase.merchant?.trim().toLowerCase();
      return Boolean(merchant && merchant.length >= 3 && lowerCoach.includes(merchant));
    });

    // Keep the deterministic numbers authoritative and keep the note focused on
    // categories, not one-off purchases.
    if (
      coach.length >= 10 &&
      !/[$€£¥\d]/.test(coach) &&
      !mentionsPurchase &&
      !mentionsMerchant
    ) {
      return { ...base, source: "ollama", coach };
    }
  } catch {
    // Ollama offline or malformed output — keep the deterministic analysis.
  }

  return base;
}

function heuristicAnalysis(input: SpendingAnalysisInput): SpendingAnalysis {
  const { totals, currency } = input;

  if (totals.spent <= 0 || input.purchases.length === 0) {
    return {
      source: "heuristic",
      summary: `No spending has been recorded for ${input.periodLabel} yet.${
        totals.budget > 0
          ? ` Your budget is ${money(totals.budget, currency)}.`
          : ""
      }`,
      insights: [
        "Record a purchase in Step 2, then run the analysis again.",
        "Add category budgets in Step 3 to track where your money goes.",
      ],
    };
  }

  const spentCategories = input.categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const top = spentCategories[0];
  const overBudget = input.categories.filter(
    (c) => c.remaining != null && c.remaining < 0,
  );
  const largest = [...input.purchases].sort((a, b) => b.amount - a.amount)[0];

  const summaryParts: string[] = [];
  if (totals.budget > 0) {
    const pct = Math.round((totals.spent / totals.budget) * 100);
    summaryParts.push(
      `You spent ${money(totals.spent, currency)} of your ${money(
        totals.budget,
        currency,
      )} budget this month (${pct}%).`,
    );
  } else {
    summaryParts.push(
      `You spent ${money(totals.spent, currency)} across ${input.purchases.length} purchase${
        input.purchases.length === 1 ? "" : "s"
      } this month.`,
    );
  }

  if (top) {
    summaryParts.push(
      `${top.name} was your biggest category at ${money(top.spent, currency)} (${Math.round(
        top.share * 100,
      )}% of spending).`,
    );
  }

  if (totals.previousSpent > 0) {
    const change = ((totals.spent - totals.previousSpent) / totals.previousSpent) * 100;
    if (Math.abs(change) >= 1) {
      summaryParts.push(
        `That is ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change))}% from last month.`,
      );
    }
  }

  const insights: string[] = [];

  if (overBudget.length > 0) {
    insights.push(
      `Over budget: ${overBudget
        .map((c) => `${c.name} (${money(Math.abs(c.remaining ?? 0), currency)} over)`)
        .join(", ")}.`,
    );
  } else if (input.categories.some((c) => c.budget != null)) {
    insights.push("Every category with a budget is still within its limit.");
  }

  if (largest) {
    insights.push(
      `Largest purchase: ${largest.description} — ${money(largest.amount, currency)}${
        largest.categoryName ? ` (${largest.categoryName})` : ""
      }.`,
    );
  }

  const average = totals.spent / Math.max(1, input.daysElapsed);
  insights.push(
    `Average daily spend: ${money(round2(average), currency)} over ${input.daysElapsed} day${
      input.daysElapsed === 1 ? "" : "s"
    }.`,
  );

  if (totals.budget > 0 && totals.remaining > 0 && input.daysRemaining > 0) {
    insights.push(
      `You have ${money(totals.remaining, currency)} left, about ${money(
        round2(totals.remaining / input.daysRemaining),
        currency,
      )} per remaining day.`,
    );
  } else if (totals.budget > 0 && totals.remaining < 0) {
    insights.push(
      `You are ${money(Math.abs(totals.remaining), currency)} over your total budget.`,
    );
  }

  if (!input.categories.some((c) => c.budget != null)) {
    insights.push("Set category budgets in Step 3 to get over/under-budget guidance.");
  }

  return {
    source: "heuristic",
    summary: summaryParts.join(" "),
    insights: insights.slice(0, MAX_INSIGHTS),
  };
}
