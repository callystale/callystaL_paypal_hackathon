import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { currency, round2 } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { periodBounds, periodLabel } from "@/lib/period";
import {
  analyzeSpending,
  type SpendingAnalysisInput,
  type SpendingCategoryDTO,
} from "@/lib/spending";

export const dynamic = "force-dynamic";

/**
 * Analyze every purchase in the current budget period. This always uses the
 * current period (offset 0), regardless of the month selected in Step 5.
 */
export async function POST() {
  try {
    const settings = await getSettings();
    const now = new Date();
    const current = periodBounds(now, settings.monthStartDay, 0);
    const previous = periodBounds(now, settings.monthStartDay, -1);

    const [categories, currentPurchases, previousPurchases] = await Promise.all([
      prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.purchase.findMany({
        where: { occurredAt: { gte: current.start, lt: current.end } },
        include: { category: true },
        orderBy: { amount: "desc" },
      }),
      prisma.purchase.findMany({
        where: { occurredAt: { gte: previous.start, lt: previous.end } },
        select: { amount: true },
      }),
    ]);

    const totalSpent = round2(
      currentPurchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    );
    const totalBudget = round2(
      categories.reduce((sum, category) => sum + (category.budget ?? 0), 0),
    );

    // Include uncategorized purchases so the analysis covers all spending, not
    // just purchases that happen to have a category.
    const spentByCategory = new Map<string | null, number>();
    for (const purchase of currentPurchases) {
      spentByCategory.set(
        purchase.categoryId,
        (spentByCategory.get(purchase.categoryId) ?? 0) + purchase.amount,
      );
    }

    const categoryRows: SpendingCategoryDTO[] = categories.map((category) => {
      const spent = round2(spentByCategory.get(category.id) ?? 0);
      return {
        name: category.name,
        color: category.color,
        spent,
        budget: category.budget,
        remaining: category.budget == null ? null : round2(category.budget - spent),
        share: totalSpent > 0 ? spent / totalSpent : 0,
      };
    });

    const uncategorized = round2(spentByCategory.get(null) ?? 0);
    if (uncategorized > 0) {
      categoryRows.push({
        name: "Uncategorized",
        color: "#94a3b8",
        spent: uncategorized,
        budget: null,
        remaining: null,
        share: totalSpent > 0 ? uncategorized / totalSpent : 0,
      });
    }

    const elapsedMs = Math.max(
      0,
      Math.min(now.getTime(), current.end.getTime()) - current.start.getTime(),
    );
    const remainingMs = Math.max(0, current.end.getTime() - now.getTime());

    const input: SpendingAnalysisInput = {
      periodStart: current.start.toISOString(),
      periodEnd: current.end.toISOString(),
      periodLabel: periodLabel(current.start, current.end),
      currency: currency(),
      totals: {
        budget: totalBudget,
        spent: totalSpent,
        remaining: round2(totalBudget - totalSpent),
        previousSpent: round2(
          previousPurchases.reduce((sum, purchase) => sum + purchase.amount, 0),
        ),
      },
      categories: categoryRows,
      purchases: currentPurchases.map((purchase) => ({
        description: purchase.description,
        amount: purchase.amount,
        merchant: purchase.merchant,
        categoryName: purchase.category?.name ?? null,
        occurredAt: purchase.occurredAt.toISOString(),
      })),
      daysElapsed: Math.max(1, Math.ceil(elapsedMs / 86_400_000)),
      daysRemaining: Math.ceil(remainingMs / 86_400_000),
    };

    const analysis = await analyzeSpending(input);

    return ok({
      ...analysis,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodLabel: input.periodLabel,
      currency: input.currency,
      totals: input.totals,
      categories: input.categories,
      purchaseCount: input.purchases.length,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
