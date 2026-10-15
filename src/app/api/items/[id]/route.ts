import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";
import { toItemDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

const alternativeSchema = z
  .object({
    name: z.string().min(1).max(200),
    price: z.number().positive(),
    url: z.string().max(500).optional(),
  })
  .nullable();

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  targetPrice: z.number().positive().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
  purchased: z.boolean().optional(),
  milestoneId: z.string().nullable().optional(),
  alternative: alternativeSchema.optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.targetPrice !== undefined) data.targetPrice = body.targetPrice;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.targetDate !== undefined) {
      data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    if (body.url !== undefined) data.url = body.url || null;
    if (body.category !== undefined) data.category = body.category;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.purchased !== undefined) data.purchased = body.purchased;
    if (body.milestoneId !== undefined) data.milestoneId = body.milestoneId;

    if (body.alternative !== undefined) {
      if (body.alternative === null) {
        data.alternativeName = null;
        data.alternativePrice = null;
        data.alternativeUrl = null;
      } else {
        data.alternativeName = body.alternative.name.trim();
        data.alternativePrice = body.alternative.price;
        data.alternativeUrl = body.alternative.url || null;
      }
    }

    const item = await prisma.desiredItem.update({ where: { id: params.id }, data });
    return ok(toItemDTO(item));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.desiredItem.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
