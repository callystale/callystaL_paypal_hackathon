import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { suggestBudgetSplit } from "@/lib/budget";
import { round2 } from "@/lib/money";

export const dynamic = "force-dynamic";

const schema = z.object({
  salary: z.number().nonnegative(),
  goals: z.string().max(2000).nullable().optional(),
  instruction: z.string().max(500).nullable().optional(),
  answers: z
    .array(z.object({ question: z.string().max(200), answer: z.string().max(500) }))
    .max(10)
    .optional(),
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        budget: z.number().nonnegative().nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Step 1b: the model splits the income across the listed categories. */
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const [categories, purchases] = await Promise.all([
      prisma.category.findMany(),
      prisma.purchase.findMany({ where: { occurredAt: { gte: startOfMonth() } } }),
    ]);

    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const spentByName = new Map<string, number>();
    for (const p of purchases) {
      const name = p.categoryId ? nameById.get(p.categoryId) : undefined;
      if (!name) continue;
      spentByName.set(name, (spentByName.get(name) ?? 0) + p.amount);
    }

    const result = await suggestBudgetSplit({
      salary: body.salary,
      goals: body.goals ?? null,
      instruction: body.instruction ?? null,
      allowNew: Boolean(body.instruction && body.instruction.trim()),
      answers: body.answers,
      categories: body.categories.map((c) => ({
        name: c.name,
        budget: c.budget ?? null,
        spent: round2(spentByName.get(c.name) ?? 0),
      })),
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
