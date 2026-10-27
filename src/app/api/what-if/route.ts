import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { round2, currency } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { periodBounds, periodLabel } from "@/lib/period";
import { estimateMonthlyBudget } from "@/lib/planner";
import {
  assessWhatIf,
  type WhatIfMilestoneRisk,
  type WhatIfSnapshot,
} from "@/lib/whatif";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().min(1),
});

/**
 * "What if I buy this now?" always evaluates the current period, even if the
 * user is browsing another month in Step 4. It considers overall spending,
 * the item's category budget, and the existing staged plan.
 */
export async function POST(request: Request) {
  try {
    const { itemId } = schema.parse(await request.json());
    const item = await prisma.desiredItem.findUnique({ where: { id: itemId } });
    if (!item) return bad("Item not found", 404);

    const settings = await getSettings();
    const now = new Date();
    const current = periodBounds(now, settings.monthStartDay, 0);
    const previous = periodBounds(now, settings.monthStartDay, -1);

    const [categories, currentPurchases, previousPurchases, milestones] =
      await Promise.all([
        prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.purchase.findMany({
          where: { occurredAt: { gte: current.start, lt: current.end } },
          select: { amount: true, categoryId: true },
        }),
        prisma.purchase.findMany({
          where: { occurredAt: { gte: previous.start, lt: previous.end } },
          select: { amount: true },
        }),
        prisma.milestone.findMany({
          include: { items: true },
          orderBy: { sequence: "asc" },
        }),
      ]);

    const price = round2(item.alternativePrice ?? item.targetPrice);
    const currencyCode = currency();

    const totalSpent = round2(
      currentPurchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    );
    const previousSpent = round2(
      previousPurchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    );

    const spentByCategory = new Map<string | null, number>();
    for (const purchase of currentPurchases) {
      spentByCategory.set(
        purchase.categoryId,
        (spentByCategory.get(purchase.categoryId) ?? 0) + purchase.amount,
      );
    }

    const hasBudget = categories.some((category) => category.budget != null);
    const totalBudget = round2(
      categories.reduce((sum, category) => sum + (category.budget ?? 0), 0),
    );
    const remaining = hasBudget ? round2(totalBudget - totalSpent) : null;
    const remainingAfter = remaining == null ? null : round2(remaining - price);
    const usedAfterRatio =
      hasBudget && totalBudget > 0 ? (totalSpent + price) / totalBudget : null;

    const uncategorizedSpent = round2(spentByCategory.get(null) ?? 0);
    const rankedCategories = [
      ...categories.map((category) => ({
        name: category.name,
        budget: category.budget,
        spent: round2(spentByCategory.get(category.id) ?? 0),
      })),
      ...(uncategorizedSpent > 0
        ? [{ name: "Uncategorized", budget: null, spent: uncategorizedSpent }]
        : []),
    ]
      .filter((category) => category.spent > 0)
      .sort((a, b) => b.spent - a.spent);

    const overBudgetCategories = categories
      .filter((category) => {
        if (category.budget == null) return false;
        return round2(spentByCategory.get(category.id) ?? 0) > category.budget;
      })
      .map((category) => category.name);

    const matchedCategory = item.category
      ? (categories.find(
          (category) =>
            category.name.toLowerCase() === item.category!.trim().toLowerCase(),
        ) ?? null)
      : null;

    const category = matchedCategory
      ? (() => {
          const spent = round2(spentByCategory.get(matchedCategory.id) ?? 0);
          const categoryRemaining =
            matchedCategory.budget == null
              ? null
              : round2(matchedCategory.budget - spent);
          return {
            name: matchedCategory.name,
            color: matchedCategory.color,
            budget: matchedCategory.budget,
            spent,
            remaining: categoryRemaining,
            remainingAfter:
              categoryRemaining == null ? null : round2(categoryRemaining - price),
          };
        })()
      : null;

    // The staged plan is funded from the overall monthly headroom, so only an
    // overall shortfall puts future milestones at risk.
    const atRisk: WhatIfMilestoneRisk[] = [];
    if (remainingAfter != null && remainingAfter < 0) {
      let needed = Math.abs(remainingAfter);
      for (const milestone of milestones) {
        const items = milestone.items.filter((candidate) => candidate.id !== item.id);
        const total = round2(
          items.reduce(
            (sum, candidate) =>
              sum + (candidate.alternativePrice ?? candidate.targetPrice),
            0,
          ),
        );
        if (total <= 0) continue;

        atRisk.push({
          id: milestone.id,
          title: milestone.title,
          total,
          items: items.map(
            (candidate) => candidate.alternativeName ?? candidate.name,
          ),
        });
        needed -= total;
        if (needed <= 0) break;
      }
    }

    const planCategories = categories.map((category) => ({
      name: category.name,
      budget: category.budget,
      spent: round2(spentByCategory.get(category.id) ?? 0),
    }));
    const monthlyBudget = estimateMonthlyBudget(planCategories);

    const elapsedMs = Math.max(
      0,
      Math.min(now.getTime(), current.end.getTime()) - current.start.getTime(),
    );
    const remainingMs = Math.max(0, current.end.getTime() - now.getTime());

    const snapshot: WhatIfSnapshot = {
      item: {
        id: item.id,
        name: item.name,
        price,
        category: item.category,
        priority: item.priority,
        targetDate: item.targetDate ? item.targetDate.toISOString() : null,
        notes: item.notes,
      },
      period: {
        start: current.start.toISOString(),
        end: current.end.toISOString(),
        label: periodLabel(current.start, current.end),
        currency: currencyCode,
        daysElapsed: Math.max(1, Math.ceil(elapsedMs / 86_400_000)),
        daysRemaining: Math.ceil(remainingMs / 86_400_000),
      },
      overall: {
        hasBudget,
        budget: totalBudget,
        spent: totalSpent,
        remaining,
        remainingAfter,
        usedAfterRatio,
        previousSpent,
        overBudgetCategories,
        topCategories: rankedCategories.slice(0, 3).map((category) => category.name),
      },
      category,
      milestones: {
        monthlyBudget,
        hasPlan: milestones.length > 0,
        atRisk,
      },
    };

    const assessment = await assessWhatIf(snapshot);
    return ok({ context: snapshot, assessment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
