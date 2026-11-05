import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail } from "@/lib/group-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const group = await findGroupDetail(params.id);
    if (!group) return bad("Group not found", 404);
    return ok(toGroupDetailDTO(group));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const group = await prisma.group.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!group) return bad("Group not found", 404);

    await prisma.$transaction(async (tx) => {
      // Shares may have copied the member's share into the personal budget.
      // Delete those purchases first so deleting a demo group doesn't leave
      // invisible spending behind in the planner.
      const shares = await tx.expenseShare.findMany({
        where: { expense: { groupId: params.id }, purchaseId: { not: null } },
        select: { purchaseId: true },
      });
      const purchaseIds = shares
        .map((share) => share.purchaseId)
        .filter((id): id is string => Boolean(id));
      if (purchaseIds.length > 0) {
        await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
      }
      await tx.group.delete({ where: { id: params.id } });
    });

    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
