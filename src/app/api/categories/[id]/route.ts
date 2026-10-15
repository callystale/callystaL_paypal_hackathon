import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());
    const category = await prisma.category.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.budget !== undefined ? { budget: body.budget } : {}),
      },
    });
    return ok(category);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.category.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
