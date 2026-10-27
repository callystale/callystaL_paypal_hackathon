import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toCategoryDTO } from "@/lib/dto";
import { round2, currency } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { periodBounds } from "@/lib/period";

export const dynamic = "force-dynamic";

/** Parse the `offset` query param (0 = current month, -1 = previous month). */
function parseOffset(raw: string | null): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  // Only past/current periods make sense, and keep the range bounded.
  return Math.min(0, Math.max(-120, Math.trunc(n)));
}

export async function GET(request: Request) {
  try {
    const settings = await getSettings();
    const offset = parseOffset(new URL(request.url).searchParams.get("offset"));
    const { start: periodStartDate, end: periodEndDate } = periodBounds(
      new Date(),
      settings.monthStartDay,
      offset,
    );
    const [categories, purchases, allPurchases, itemCount, purchasedCount] = await Promise.all([
      prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.purchase.findMany({
        where: { occurredAt: { gte: periodStartDate, lt: periodEndDate } },
      }),
      prisma.purchase.findMany({ select: { amount: true } }),
      prisma.desiredItem.count(),
      prisma.desiredItem.count({ where: { purchased: true } }),
    ]);

    const categoryDTOs = categories.map((c) => toCategoryDTO(c, purchases));
    const totalBudget = round2(
      categories.reduce((sum, c) => sum + (c.budget ?? 0), 0),
    );
    const totalSpent = round2(categoryDTOs.reduce((sum, c) => sum + c.spent, 0));

    return ok({
      currency: currency(),
      periodStart: periodStartDate.toISOString(),
      periodEnd: periodEndDate.toISOString(),
      offset,
      monthStartDay: settings.monthStartDay,
      totals: {
        budget: totalBudget,
        spent: totalSpent,
        remaining: round2(totalBudget - totalSpent),
        allTimeSpent: round2(allPurchases.reduce((s, p) => s + p.amount, 0)),
      },
      categories: categoryDTOs,
      items: { total: itemCount, purchased: purchasedCount },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
