import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toPurchaseDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  description: z.string().min(1).max(140).optional(),
  amount: z.number().positive().optional(),
  merchant: z.string().max(80).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());
    const purchase = await prisma.purchase.update({
      where: { id: params.id },
      data: {
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.merchant !== undefined ? { merchant: body.merchant?.trim() || null } : {}),
        ...(body.categoryId !== undefined
          ? { categoryId: body.categoryId, userCategorized: true }
          : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: new Date(body.occurredAt) } : {}),
      },
      include: { category: true },
    });
    return ok(toPurchaseDTO(purchase));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.purchase.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
