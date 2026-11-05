import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail, findGroupWithMembers } from "@/lib/group-data";
import { fromCents, splitEqually, toCents } from "@/lib/group";

export const dynamic = "force-dynamic";

const shareSchema = z.object({
  memberId: z.string().min(1),
  amountCents: z.number().int().min(0).max(100_000_000_000),
});

const updateSchema = z
  .object({
    description: z.string().trim().min(1).max(140).optional(),
    /** Amount in major units. If omitted, shares must add up to the new total. */
    amount: z.number().positive().max(1_000_000_000).optional(),
    payerId: z.string().min(1).optional(),
    occurredAt: z.string().datetime().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    shares: z.array(shareSchema).min(1).optional(),
  })
  .refine(
    (value) =>
      value.description !== undefined ||
      value.amount !== undefined ||
      value.payerId !== undefined ||
      value.occurredAt !== undefined ||
      value.category !== undefined ||
      value.shares !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; expenseId: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());
    const group = await findGroupWithMembers(params.id);
    if (!group) return bad("Group not found", 404);

    const memberIds = new Set(group.members.map((member) => member.id));
    const payerId = body.payerId ?? undefined;
    if (payerId && !memberIds.has(payerId)) {
      return bad("Payer must be a member of this group", 400);
    }

    if (body.shares) {
      const seen = new Set<string>();
      for (const share of body.shares) {
        if (!memberIds.has(share.memberId)) {
          return bad("Every participant must be a member of this group", 400);
        }
        if (seen.has(share.memberId)) {
          return bad("A member can only appear once in the split", 400);
        }
        seen.add(share.memberId);
      }
    }

    if (body.occurredAt && Number.isNaN(new Date(body.occurredAt).getTime())) {
      return bad("Invalid expense date", 400);
    }

    await prisma.$transaction(async (tx) => {
      // Check inside the write transaction so a concurrent payment cannot slip
      // between the lock check and changing the split. Unpaid requests do not lock it.
      const settlementCount = await tx.settlement.count({
        where: { groupId: params.id, status: { in: ["SETTLED", "CAPTURING"] } },
      });
      if (settlementCount > 0) {
        throw new Error(
          "This expense is locked because a payment has completed or is being processed in this group.",
        );
      }

      const expense = await tx.groupExpense.findFirst({
        where: { id: params.expenseId, groupId: params.id },
        include: { shares: true },
      });
      if (!expense) throw new Error("Expense not found");

      const requestedShares = body.shares
        ?.filter((share) => share.amountCents > 0)
        .map((share) => ({ ...share }));
      const existingShares = expense.shares;
      const amountCents =
        body.amount !== undefined
          ? toCents(body.amount)
          : requestedShares
            ? requestedShares.reduce((sum, share) => sum + share.amountCents, 0)
            : expense.amountCents;

      if (amountCents <= 0) {
        throw new Error("Amount must be at least one cent");
      }

      const nextShares = requestedShares
        ? requestedShares
        : amountCents === expense.amountCents
          ? existingShares.map((share) => ({
              memberId: share.memberId,
              amountCents: share.amountCents,
            }))
          : splitEqually(
              amountCents,
              existingShares.map((share) => share.memberId),
            );

      if (nextShares.length === 0) {
        throw new Error("At least one participant is required");
      }

      const shareTotal = nextShares.reduce((sum, share) => sum + share.amountCents, 0);
      if (shareTotal !== amountCents) {
        throw new Error("Participant shares must add up to the expense total");
      }

      const nextByMember = new Map(
        nextShares.map((share) => [share.memberId, share.amountCents]),
      );
      const existingByMember = new Map(
        existingShares.map((share) => [share.memberId, share]),
      );

      // Remove participants who are no longer included, along with any
      // personal-budget copy that was created from their share.
      for (const share of existingShares) {
        if (nextByMember.has(share.memberId)) continue;
        if (share.purchaseId) {
          await tx.purchase.delete({ where: { id: share.purchaseId } });
        }
        await tx.expenseShare.delete({ where: { id: share.id } });
      }

      // Update existing participants and create newly added ones.
      for (const share of nextShares) {
        const existing = existingByMember.get(share.memberId);
        if (existing) {
          await tx.expenseShare.update({
            where: { id: existing.id },
            data: { amountCents: share.amountCents },
          });
          if (existing.purchaseId) {
            await tx.purchase.update({
              where: { id: existing.purchaseId },
              data: {
                amount: fromCents(share.amountCents),
                ...(body.description !== undefined
                  ? { description: `Shared: ${body.description}`.slice(0, 140) }
                  : {}),
                ...(body.occurredAt !== undefined
                  ? { occurredAt: new Date(body.occurredAt) }
                  : {}),
              },
            });
          }
        } else {
          await tx.expenseShare.create({
            data: {
              expenseId: expense.id,
              memberId: share.memberId,
              amountCents: share.amountCents,
            },
          });
        }
      }

      // Old requests describe the previous balances. Remove them atomically;
      // their capture/mark-paid endpoints will reject the missing request.
      await tx.settlement.deleteMany({ where: { groupId: params.id, status: "PENDING" } });

      await tx.groupExpense.update({
        where: { id: expense.id },
        data: {
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          amountCents,
          ...(payerId ? { payerId } : {}),
          ...(body.occurredAt !== undefined
            ? { occurredAt: new Date(body.occurredAt) }
            : {}),
          ...(body.category !== undefined
            ? { category: body.category || null }
            : {}),
        },
      });
    });

    const detail = await findGroupDetail(params.id);
    return ok({ group: detail ? toGroupDetailDTO(detail) : null });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Expense not found") return bad(error.message, 404);
      if (error.message.includes("locked")) return bad(error.message, 409);
      if (
        error.message.includes("At least one") ||
        error.message.includes("add up") ||
        error.message.includes("at least one cent")
      ) {
        return bad(error.message, 400);
      }
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; expenseId: string } },
) {
  try {
    const expense = await prisma.groupExpense.findFirst({
      where: { id: params.expenseId, groupId: params.id },
      include: { shares: { select: { purchaseId: true } } },
    });
    if (!expense) return bad("Expense not found", 404);

    await prisma.$transaction(async (tx) => {
      const recordedPayments = await tx.settlement.count({
        where: { groupId: params.id, status: { in: ["SETTLED", "CAPTURING"] } },
      });
      if (recordedPayments > 0) {
        throw new Error("Expenses are locked because a payment has completed or is being processed in this group.");
      }
      await tx.settlement.deleteMany({ where: { groupId: params.id, status: "PENDING" } });
      const purchaseIds = expense.shares
        .map((share) => share.purchaseId)
        .filter((id): id is string => Boolean(id));
      if (purchaseIds.length > 0) {
        await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
      }
      await tx.groupExpense.delete({ where: { id: expense.id } });
    });

    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("locked")) return bad(error.message, 409);
    return toErrorResponse(error);
  }
}
