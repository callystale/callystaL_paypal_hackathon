import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { SETTINGS_ID } from "@/lib/settings";

export const dynamic = "force-dynamic";

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  budget: z.number().nonnegative().nullable(),
});

const saveSchema = z.object({
  salary: z.number().nonnegative(),
  goals: z.string().max(2000).nullable().optional(),
  categories: z
    .array(categorySchema)
    .max(50)
    .refine(
      (arr) => new Set(arr.map((c) => c.name.trim().toLowerCase())).size === arr.length,
      { message: "Category names must be unique" },
    ),
});

/**
 * Saves the whole Step 1 plan in one shot: income, goals and the reconciled
 * category list (created, renamed, re-amounted or removed). Categories are the
 * same ones the Budget panel (Step 3) tracks spending against.
 */
export async function PUT(request: Request) {
  try {
    const body = saveSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      await tx.settings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, salary: body.salary, goals: body.goals ?? null },
        update: { salary: body.salary, goals: body.goals ?? null },
      });

      const existing = await tx.category.findMany({ orderBy: { createdAt: "asc" } });
      const existingIds = new Set(existing.map((c) => c.id));
      const keepIds = new Set<string>();

      for (const c of body.categories) {
        const name = c.name.trim();
        if (c.id && existingIds.has(c.id)) {
          const updated = await tx.category.update({
            where: { id: c.id },
            data: {
              name,
              budget: c.budget,
              ...(c.color ? { color: c.color } : {}),
            },
          });
          keepIds.add(updated.id);
        } else {
          // New row (or a rename onto an existing name): upsert keeps names unique.
          const created = await tx.category.upsert({
            where: { name },
            create: { name, color: c.color ?? "#6366f1", budget: c.budget },
            update: { budget: c.budget, ...(c.color ? { color: c.color } : {}) },
          });
          keepIds.add(created.id);
        }
      }

      const toRemove = [...existingIds].filter((id) => !keepIds.has(id));
      if (toRemove.length > 0) {
        await tx.category.deleteMany({ where: { id: { in: toRemove } } });
      }

      return {
        salary: body.salary,
        goals: body.goals ?? null,
        categories: await tx.category.findMany({ orderBy: { createdAt: "asc" } }),
      };
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
