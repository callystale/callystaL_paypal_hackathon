import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { findAlternatives } from "@/lib/alternatives";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ itemId: z.string().min(1) }),
  z.object({
    name: z.string().min(1).max(120),
    targetPrice: z.number().positive(),
    notes: z.string().max(300).nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    let target = body as { name: string; targetPrice: number; notes?: string | null };
    if ("itemId" in body) {
      const item = await prisma.desiredItem.findUnique({ where: { id: body.itemId } });
      if (!item) return bad("Item not found", 404);
      target = { name: item.name, targetPrice: item.targetPrice, notes: item.notes };
    }

    const result = await findAlternatives(target);
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
