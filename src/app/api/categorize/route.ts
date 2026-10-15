import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { categorizePurchase } from "@/lib/planner";

export const dynamic = "force-dynamic";

const schema = z.object({
  description: z.string().min(1).max(140),
  merchant: z.string().max(80).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const categories = await prisma.category.findMany({ select: { name: true } });
    const guess = await categorizePurchase({
      description: body.description,
      merchant: body.merchant ?? null,
      categories: categories.map((c) => c.name),
    });
    return ok(guess);
  } catch (error) {
    return toErrorResponse(error);
  }
}
