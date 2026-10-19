import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toItemDTO } from "@/lib/dto";
import { categorizePurchase } from "@/lib/planner";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  targetPrice: z.number().positive(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  url: z.string().url().nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
  autoCategorize: z.boolean().optional(),
});

export async function GET() {
  try {
    const items = await prisma.desiredItem.findMany({
      orderBy: [{ purchased: "asc" }, { createdAt: "desc" }],
    });
    return ok(items.map(toItemDTO));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());

    let category = body.category?.trim() || null;
    if (!category && body.autoCategorize) {
      const categories = await prisma.category.findMany({ select: { name: true } });
      if (categories.length > 0) {
        const guess = await categorizePurchase({
          description: body.notes ? `${body.name} — ${body.notes}` : body.name,
          merchant: null,
          categories: categories.map((c) => c.name),
        });
        const match = categories.find((c) => c.name === guess.categoryName);
        if (match && guess.confidence >= 0.3) category = match.name;
      }
    }

    const item = await prisma.desiredItem.create({
      data: {
        name: body.name.trim(),
        targetPrice: body.targetPrice,
        priority: body.priority ?? "MEDIUM",
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        url: body.url ?? null,
        category,
        notes: body.notes ?? null,
      },
    });
    return ok(toItemDTO(item), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
