import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toCategoryDTO } from "@/lib/dto";
import { round2, currency } from "@/lib/money";

export const dynamic = "force-dynamic";

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET() {
  try {
    const [categories, purchases, allPurchases, itemCount, purchasedCount] = await Promise.all([
      prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.purchase.findMany({ where: { occurredAt: { gte: startOfMonth() } } }),
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
      periodStart: startOfMonth().toISOString(),
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
