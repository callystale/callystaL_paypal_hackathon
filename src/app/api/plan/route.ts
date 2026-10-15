import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toMilestoneDTO, toPlanItem } from "@/lib/dto";
import { estimateMonthlyBudget, generatePlan } from "@/lib/planner";
import { round2 } from "@/lib/money";

export const dynamic = "force-dynamic";

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function buildContext() {
  const [categories, purchases] = await Promise.all([
    prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.purchase.findMany({ where: { occurredAt: { gte: startOfMonth() } } }),
  ]);

  const planCategories = categories.map((c) => ({
    name: c.name,
    budget: c.budget,
    spent: round2(
      purchases.filter((p) => p.categoryId === c.id).reduce((s, p) => s + p.amount, 0),
    ),
  }));

  return { planCategories, monthlyBudget: estimateMonthlyBudget(planCategories) };
}

export async function GET() {
  try {
    const [milestones, context] = await Promise.all([
      prisma.milestone.findMany({
        include: { items: true },
        orderBy: { sequence: "asc" },
      }),
      buildContext(),
    ]);

    return ok({
      monthlyBudget: context.monthlyBudget,
      milestones: milestones.map(toMilestoneDTO),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    const [items, context] = await Promise.all([
      prisma.desiredItem.findMany({ where: { purchased: false }, orderBy: { createdAt: "asc" } }),
      buildContext(),
    ]);

    const plan = await generatePlan({
      items: items.map(toPlanItem),
      categories: context.planCategories,
      monthlyBudget: context.monthlyBudget,
    });

    const created = await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany();
      const results = [];
      for (let i = 0; i < plan.milestones.length; i++) {
        const m = plan.milestones[i];
        results.push(
          await tx.milestone.create({
            data: {
              title: m.title,
              rationale: m.rationale,
              sequence: i + 1,
              items: { connect: m.itemIds.map((id) => ({ id })) },
            },
            include: { items: true },
          }),
        );
      }
      return results;
    });

    return ok({
      source: plan.source,
      monthlyBudget: plan.monthlyBudget,
      milestones: created.map(toMilestoneDTO),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    await prisma.milestone.deleteMany();
    return ok({ cleared: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
