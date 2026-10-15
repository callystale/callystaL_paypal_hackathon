import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toCategoryDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export async function GET() {
  try {
    const [categories, purchases] = await Promise.all([
      prisma.category.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.purchase.findMany(),
    ]);
    return ok(categories.map((c) => toCategoryDTO(c, purchases)));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const category = await prisma.category.create({
      data: {
        name: body.name.trim(),
        color: body.color ?? "#6366f1",
        budget: body.budget ?? null,
      },
    });
    return ok(toCategoryDTO(category, []), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
