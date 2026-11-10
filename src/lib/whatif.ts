import { formatCurrency, round2 } from "./money";
import { ollamaJson } from "./ollama";

export type WhatIfVerdict = "buy" | "wait" | "avoid";

export interface WhatIfCategorySnapshot {
  name: string;
  color: string;
  budget: number | null;
  spent: number;
  remaining: number | null;
  remainingAfter: number | null;
}

export interface WhatIfMilestoneRisk {
  id: string;
  title: string;
  total: number;
  items: string[];
}

export interface WhatIfSnapshot {
  item: {
    id: string;
    name: string;
    price: number;
    category: string | null;
    priority: string;
    targetDate: string | null;
    notes: string | null;
  };
  period: {
    start: string;
    end: string;
    label: string;
    currency: string;
    daysElapsed: number;
    daysRemaining: number;
  };
  overall: {
    hasBudget: boolean;
    budget: number;
    spent: number;
    remaining: number | null;
    remainingAfter: number | null;
    usedAfterRatio: number | null;
    previousSpent: number;
    /** Names of categories that are already over their cap. */
    overBudgetCategories: string[];
    /** Names of the categories with the most spending this period. */
    topCategories: string[];
  };
  category: WhatIfCategorySnapshot | null;
  milestones: {
    monthlyBudget: number;
    hasPlan: boolean;
    atRisk: WhatIfMilestoneRisk[];
  };
}

export interface WhatIfAssessment {
  source: "ollama" | "heuristic";
  verdict: WhatIfVerdict;
  headline: string;
  summary: string;
  factors: string[];
  recommendation: string;
}

export interface WhatIfResponse {
  preRecorded?: { model: string; capturedAt: string };
  context: WhatIfSnapshot;
  assessment: WhatIfAssessment;
}

const VERDICT_RANK: Record<WhatIfVerdict, number> = { buy: 0, wait: 1, avoid: 2 };

function money(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function moreCautious(a: WhatIfVerdict, b: WhatIfVerdict): WhatIfVerdict {
  return VERDICT_RANK[b] >= VERDICT_RANK[a] ? b : a;
}

function cautiousHeadline(verdict: WhatIfVerdict): string {
  if (verdict === "avoid") return "Not a good time to buy";
  if (verdict === "wait") return "Better to wait";
  return "Fits your budget";
}

function parseVerdict(value: unknown): WhatIfVerdict | null {
  if (typeof value !== "string") return null;
  const verdict = value.trim().toLowerCase();
  return verdict === "buy" || verdict === "wait" || verdict === "avoid" ? verdict : null;
}

/** The AI writes the narrative; figures stay in the deterministic factors. */
function cleanNarrative(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 10 || text.length > maxLength) return null;
  if (/[$€£¥\d]/.test(text)) return null;
  return text;
}

function narrativeMatches(verdict: WhatIfVerdict, text: string): boolean {
  const lower = text.toLowerCase();
  if (verdict === "buy") {
    return !/(wait|avoid|don't buy|do not buy|cannot afford|can't afford)/.test(lower);
  }
  if (verdict === "wait") {
    return !/(buy it now|you can buy|go ahead and buy)/.test(lower);
  }
  return true;
}

function describeOverall(snapshot: WhatIfSnapshot): string {
  const { overall } = snapshot;
  if (!overall.hasBudget) return "no overall budget is set";
  const after = overall.remainingAfter ?? 0;
  if (after < 0) return "this purchase would exceed the overall budget";
  if (after === 0) return "this purchase would use up the overall budget";
  const ratio = overall.usedAfterRatio ?? 0;
  if (ratio >= 0.9) return "this purchase would leave very little room in the overall budget";
  if (ratio >= 0.75) return "this purchase would use most of the overall budget";
  return "this purchase would leave a comfortable amount in the overall budget";
}

function describeCategory(snapshot: WhatIfSnapshot): string {
  const { category, item } = snapshot;
  if (!category) {
    return item.category
      ? `no budget category matches ${item.category}`
      : "the item has no category";
  }
  if (category.budget == null || category.remainingAfter == null) {
    return `the ${category.name} category has no cap set`;
  }
  if (category.remaining != null && category.remaining < 0) {
    return `the ${category.name} category is already over its cap`;
  }
  if (category.remainingAfter < 0) {
    return `this purchase would push the ${category.name} category over its cap`;
  }
  return `this purchase would stay within the ${category.name} category cap`;
}

function describeMilestones(snapshot: WhatIfSnapshot): string {
  const { atRisk, hasPlan } = snapshot.milestones;
  if (atRisk.length > 0) {
    return `this purchase would put ${plural(atRisk.length, "planned milestone")} at risk`;
  }
  if (hasPlan) return "no planned milestones would be at risk";
  return "there is no staged plan yet";
}

function describePrevious(snapshot: WhatIfSnapshot): string {
  const { spent, previousSpent } = snapshot.overall;
  if (previousSpent <= 0) return "no previous-period spending to compare";
  const difference = spent - previousSpent;
  if (difference > 0) return "spending is higher than the previous period";
  if (difference < 0) return "spending is lower than the previous period";
  return "spending is about the same as the previous period";
}

function describeTargetDate(targetDate: string | null): string {
  if (!targetDate) return "not set";
  const days = Math.ceil((Date.parse(targetDate) - Date.now()) / 86_400_000);
  if (!Number.isFinite(days)) return "not set";
  if (days < 0) return "already passed";
  if (days <= 30) return "within the next month";
  return "more than a month away";
}

function buildPrompt(snapshot: WhatIfSnapshot, base: WhatIfAssessment): string {
  const { item, overall } = snapshot;
  return (
    `Item: ${item.name}\n` +
    `Priority: ${item.priority.toLowerCase()}\n` +
    `Target date: ${describeTargetDate(item.targetDate)}\n` +
    `Overall: ${describeOverall(snapshot)}\n` +
    `Category: ${describeCategory(snapshot)}\n` +
    `Other categories over budget: ${
      overall.overBudgetCategories.length > 0
        ? overall.overBudgetCategories.join(", ")
        : "none"
    }\n` +
    `Top spending categories: ${
      overall.topCategories.length > 0 ? overall.topCategories.join(", ") : "none"
    }\n` +
    `Previous period: ${describePrevious(snapshot)}\n` +
    `Planned milestones: ${describeMilestones(snapshot)}\n` +
    `Conservative local check: ${base.verdict.toUpperCase()} — ${base.headline}.\n\n` +
    "Decide whether the user should buy now, wait, or avoid. Consider BOTH the overall " +
    "budget and the category budget, as well as the other spending categories and the " +
    "staged plan. You may be more cautious than the local check, but never more optimistic.\n" +
    'Return strict JSON: {"verdict":"buy|wait|avoid","summary":"2-3 sentences of ' +
    'qualitative assessment without numbers","recommendation":"one short action sentence ' +
    'without numbers"}'
  );
}

const SYSTEM_PROMPT =
  "You are a careful personal budgeting coach. Assess whether the user should buy " +
  "an item now, considering both the overall budget and the item's category budget, " +
  "current spending, other over-budget categories, and planned milestones. A " +
  "conservative local check is provided. You may be more cautious, but never more " +
  "optimistic. The app displays exact figures separately, so do not mention numbers, " +
  "amounts, percentages, or dates. Do not invent purchases or categories. Return " +
  "strict JSON only.";

/**
 * Uses the local model for a qualitative second opinion. A deterministic
 * assessment is always computed first, and the model can only make the verdict
 * more cautious — never more optimistic.
 */
export async function assessWhatIf(
  snapshot: WhatIfSnapshot,
): Promise<WhatIfAssessment> {
  const base = heuristicAssessment(snapshot);
  if (!snapshot.overall.hasBudget) return base;

  try {
    const data = await ollamaJson<{
      verdict?: unknown;
      summary?: unknown;
      recommendation?: unknown;
    }>(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(snapshot, base) },
      ],
      { temperature: 0.3, timeoutMs: 10_000 },
    );

    const aiVerdict = parseVerdict(data.verdict);
    const summary = cleanNarrative(data.summary, 500);
    const recommendation = cleanNarrative(data.recommendation, 220);
    if (!aiVerdict || !summary || !recommendation) return base;

    const finalVerdict = moreCautious(base.verdict, aiVerdict);
    // If the model is more optimistic than the local check, keep the local
    // answer. Also avoid letting it jump from "buy" straight to "avoid"
    // without a deterministic financial reason.
    if (finalVerdict !== aiVerdict) return base;
    if (VERDICT_RANK[aiVerdict] > VERDICT_RANK[base.verdict] + 1) return base;
    if (
      !narrativeMatches(finalVerdict, summary) ||
      !narrativeMatches(finalVerdict, recommendation)
    ) {
      return base;
    }

    return {
      ...base,
      source: "ollama",
      verdict: finalVerdict,
      headline:
        finalVerdict === base.verdict ? base.headline : cautiousHeadline(finalVerdict),
      summary,
      recommendation,
    };
  } catch {
    return base;
  }
}

function heuristicAssessment(snapshot: WhatIfSnapshot): WhatIfAssessment {
  const { item, overall, category, milestones, period } = snapshot;
  const factors = buildFactors(snapshot);

  if (!overall.hasBudget) {
    return {
      source: "heuristic",
      verdict: "wait",
      headline: "Set a budget to assess this",
      summary: `You have not set any category budgets yet, so there is no overall budget to compare against. You have spent ${money(
        overall.spent,
        period.currency,
      )} this period.`,
      factors,
      recommendation: "Set category budgets in Step 3, then check again.",
    };
  }

  const remainingAfter = overall.remainingAfter ?? 0;
  const categoryAfter = category?.remainingAfter ?? null;
  const categoryOver = categoryAfter != null && categoryAfter < 0;
  const overallOver = remainingAfter < 0;
  const milestonesAtRisk = milestones.atRisk.length > 0;

  let verdict: WhatIfVerdict;
  let headline: string;
  let summary: string;
  let recommendation: string;

  if (overallOver) {
    verdict = "avoid";
    headline = "Over your overall budget";
    summary =
      `Buying ${item.name} now would put you ${money(
        Math.abs(remainingAfter),
        period.currency,
      )} over your overall budget.` +
      (categoryOver
        ? ` It would also put ${category?.name} ${money(
            Math.abs(categoryAfter ?? 0),
            period.currency,
          )} over its cap.`
        : "") +
      " Wait until the next period or free up money first.";
    recommendation = "Wait until next period, or reduce other spending first.";
  } else if (categoryOver) {
    verdict = "wait";
    headline = `Fits overall, but over ${category?.name ?? "category"}`;
    summary =
      `Buying ${item.name} now fits your overall budget, leaving ${money(
        remainingAfter,
        period.currency,
      )}, but it would put ${category?.name ?? "this category"} ${money(
        Math.abs(categoryAfter ?? 0),
        period.currency,
      )} over its cap. You could wait, or reduce other ${
        category?.name ?? "category"
      } spending.`;
    recommendation = `Wait, or free up ${money(
      Math.abs(categoryAfter ?? 0),
      period.currency,
    )} in ${category?.name ?? "that category"}.`;
  } else if (milestonesAtRisk) {
    verdict = "wait";
    headline = "Fits, but delays your plan";
    summary =
      `Buying ${item.name} now fits your overall budget, leaving ${money(
        remainingAfter,
        period.currency,
      )}, but it would put ${plural(
        milestones.atRisk.length,
        "planned milestone",
      )} at risk. You may need to delay those purchases.`;
    recommendation = "Wait, or accept delaying your planned milestones.";
  } else {
    verdict = "buy";
    headline = "Fits your budget";
    const categorySentence =
      category && categoryAfter != null
        ? ` It also stays within your ${category.name} budget, leaving ${money(
            categoryAfter,
            period.currency,
          )}.`
        : category
          ? ` The ${category.name} category has no cap set.`
          : "";
    summary =
      `Buying ${item.name} now fits your overall budget, leaving ${money(
        remainingAfter,
        period.currency,
      )}.` +
      categorySentence +
      (milestones.hasPlan ? " No planned milestones would be at risk." : "");
    recommendation = "Buy it now.";
  }

  return { source: "heuristic", verdict, headline, summary, factors, recommendation };
}

function buildFactors(snapshot: WhatIfSnapshot): string[] {
  const { item, overall, category, milestones, period } = snapshot;
  const currency = period.currency;
  const factors: string[] = [];

  if (overall.hasBudget) {
    const after = overall.remainingAfter ?? 0;
    factors.push(
      after < 0
        ? `Overall budget: ${money(overall.spent, currency)} spent of ${money(
            overall.budget,
            currency,
          )}; this purchase would put you ${money(Math.abs(after), currency)} over.`
        : `Overall budget: ${money(overall.spent, currency)} spent of ${money(
            overall.budget,
            currency,
          )}; ${money(after, currency)} would remain after this purchase.`,
    );
  } else {
    factors.push("Overall budget: no category caps are set.");
  }

  if (category) {
    if (category.budget == null || category.remainingAfter == null) {
      factors.push(`${category.name}: ${money(category.spent, currency)} spent; no cap set.`);
    } else if (category.remainingAfter < 0) {
      factors.push(
        `${category.name}: ${money(category.spent, currency)} spent of ${money(
          category.budget,
          currency,
        )}; this purchase would put it ${money(
          Math.abs(category.remainingAfter),
          currency,
        )} over.`,
      );
    } else {
      factors.push(
        `${category.name}: ${money(category.spent, currency)} spent of ${money(
          category.budget,
          currency,
        )}; ${money(category.remainingAfter, currency)} would remain after this purchase.`,
      );
    }
  } else if (item.category) {
    factors.push(`No budget category matches "${item.category}".`);
  } else {
    factors.push("This item has no category, so only the overall budget applies.");
  }

  if (overall.overBudgetCategories.length > 0) {
    const others = overall.overBudgetCategories.filter(
      (name) => name !== category?.name,
    );
    if (others.length > 0) {
      factors.push(`Other categories already over budget: ${others.join(", ")}.`);
    }
  }

  if (overall.topCategories.length > 0) {
    factors.push(`Top spending areas: ${overall.topCategories.slice(0, 3).join(", ")}.`);
  }

  if (milestones.atRisk.length > 0) {
    factors.push(
      `Planned milestones at risk: ${milestones.atRisk.map((m) => m.title).join(", ")}.`,
    );
  } else if (milestones.hasPlan) {
    factors.push("No planned milestones would be at risk.");
  } else {
    factors.push("No staged plan yet.");
  }

  if (overall.previousSpent > 0) {
    const change =
      ((overall.spent - overall.previousSpent) / overall.previousSpent) * 100;
    if (Math.abs(change) >= 1) {
      factors.push(
        `Spending is ${change > 0 ? "up" : "down"} ${Math.abs(
          Math.round(change),
        )}% from the previous period.`,
      );
    }
  }

  if (item.priority === "HIGH") {
    factors.push("This item is marked high priority.");
  }

  return factors.slice(0, 7);
}
