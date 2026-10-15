import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toPurchaseDTO } from "@/lib/dto";
import { categorizePurchase } from "@/lib/planner";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  description: z.string().min(1).max(140),
  amount: z.number().positive(),
  merchant: z.string().max(80).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  autoCategorize: z.boolean().optional(),
});

export async function GET() {
  try {
    const purchases = await prisma.purchase.findMany({
      include: { category: true },
      orderBy: { occurredAt: "desc" },
    });
    return ok(purchases.map(toPurchaseDTO));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());

    let categoryId = body.categoryId ?? null;
    let aiConfidence: number | null = null;
    let userCategorized = Boolean(body.categoryId);

    if (!categoryId && body.autoCategorize !== false) {
      const categories = await prisma.category.findMany({ select: { id: true, name: true } });
      const names = categories.map((c) => c.name);
      const guess = await categorizePurchase({
        description: body.description,
        merchant: body.merchant ?? null,
        categories: names,
      });
      const match = categories.find((c) => c.name === guess.categoryName);
      if (match) {
        categoryId = match.id;
        aiConfidence = guess.confidence;
        userCategorized = false;
      }
    }

    const purchase = await prisma.purchase.create({
      data: {
        description: body.description.trim(),
        amount: body.amount,
        merchant: body.merchant?.trim() || null,
        categoryId,
        aiConfidence,
        userCategorized,
        ...(body.occurredAt ? { occurredAt: new Date(body.occurredAt) } : {}),
      },
      include: { category: true },
    });

    return ok(toPurchaseDTO(purchase), 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
