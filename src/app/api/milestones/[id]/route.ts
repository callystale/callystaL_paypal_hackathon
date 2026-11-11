import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toMilestoneDTO } from "@/lib/dto";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = z.object({ title: z.string().trim().min(1).max(80) }).parse(await request.json());
    if (!await prisma.milestone.findUnique({ where: { id: params.id } })) return bad("Milestone not found", 404);
    return ok(toMilestoneDTO(await prisma.milestone.update({ where: { id: params.id }, data: body, include: { items: true } })));
  } catch (error) { return toErrorResponse(error); }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const exists = await prisma.$transaction(async (tx) => {
      if (!await tx.milestone.findUnique({ where: { id: params.id } })) return false;
      // Deleting a stage must never delete its wishlist items or payment history.
      await tx.desiredItem.updateMany({ where: { milestoneId: params.id }, data: { milestoneId: null } });
      await tx.milestone.delete({ where: { id: params.id } });
      const remaining = await tx.milestone.findMany({ orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] });
      for (let i = 0; i < remaining.length; i++) await tx.milestone.update({ where: { id: remaining[i].id }, data: { sequence: i + 1 } });
      return true;
    });
    return exists ? ok({ deleted: true }) : bad("Milestone not found", 404);
  } catch (error) { return toErrorResponse(error); }
}
