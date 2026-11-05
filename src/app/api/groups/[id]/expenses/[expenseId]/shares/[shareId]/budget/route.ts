import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toPurchaseDTO } from "@/lib/dto";
import { fromCents } from "@/lib/group";

export const dynamic = "force-dynamic";

const linkSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
});

async function findShare(id: string, expenseId: string, groupId: string) {
  return prisma.expenseShare.findFirst({
    where: { id, expenseId, expense: { groupId } },
    include: {
      member: true,
      purchase: true,
      expense: { include: { group: true } },
    },
  });
}

/** Copy the local user's share into their personal budget as one purchase. */
export async function POST(
  request: Request,
  { params }: { params: { id: string; expenseId: string; shareId: string } },
) {
  try {
    const body = linkSchema.parse(await request.json().catch(() => ({})));
    const share = await findShare(params.shareId, params.expenseId, params.id);
    if (!share) return bad("Expense share not found", 404);
    if (!share.member.isSelf) {
      return bad("Only your own share can be added to your personal budget", 400);
    }
    if (share.amountCents <= 0) {
      return bad("This share is zero, so there is nothing to add", 400);
    }

    const categoryId = body.categoryId ?? null;
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) return bad("Category not found", 404);
    }

    const description = `Shared: ${share.expense.description}`.slice(0, 140);
    const merchant = share.expense.group.name.slice(0, 80);

    const purchase = await prisma.$transaction(async (tx) => {
      if (share.purchaseId) {
        return tx.purchase.update({
          where: { id: share.purchaseId },
          data: {
            description,
            amount: fromCents(share.amountCents),
            merchant,
            categoryId,
            userCategorized: Boolean(categoryId),
            occurredAt: share.expense.occurredAt,
          },
          include: { category: true },
        });
      }

      const created = await tx.purchase.create({
        data: {
          description,
          amount: fromCents(share.amountCents),
          merchant,
          categoryId,
          userCategorized: Boolean(categoryId),
          occurredAt: share.expense.occurredAt,
        },
        include: { category: true },
      });
      await tx.expenseShare.update({
        where: { id: share.id },
        data: { purchaseId: created.id },
      });
      return created;
    });

    return ok({ purchase: toPurchaseDTO(purchase) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Take the shared cost back out of the personal budget. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; expenseId: string; shareId: string } },
) {
  try {
    const share = await findShare(params.shareId, params.expenseId, params.id);
    if (!share) return bad("Expense share not found", 404);
    if (!share.purchaseId) return ok({ deleted: false });

    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.update({
        where: { id: share.id },
        data: { purchaseId: null },
      });
      await tx.purchase.delete({ where: { id: share.purchaseId! } });
    });

    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
