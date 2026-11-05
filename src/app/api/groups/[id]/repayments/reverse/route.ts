import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail, groupDetailInclude } from "@/lib/group-data";
import { settlementLocksExpenses } from "@/lib/group";

export const dynamic = "force-dynamic";

const schema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  amountCents: z.number().int().positive().max(100_000_000_000),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = schema.parse(await request.json());
    await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id: params.id }, include: groupDetailInclude });
      if (!group) throw new Error("Group not found");
      if (group.settlements.some((settlement) => settlementLocksExpenses(settlement.status))) {
        throw new Error("Direction is locked because a payment has completed or is being processed.");
      }
      // Match the current server calculation. This also prevents duplicate clicks,
      // stale amounts, self-transfers, and references to another group's members.
      const current = toGroupDetailDTO(group).repayments.some((repayment) =>
        repayment.fromMemberId === body.fromMemberId &&
        repayment.toMemberId === body.toMemberId &&
        repayment.amountCents === body.amountCents,
      );
      if (!current) throw new Error("Repayment changed. Refresh the group and try again.");

      await tx.repaymentDirectionChange.create({ data: { groupId: params.id, ...body } });
      await tx.settlement.deleteMany({ where: { groupId: params.id, status: "PENDING" } });
    });
    const group = await findGroupDetail(params.id);
    return ok({ group: group ? toGroupDetailDTO(group) : null });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Group not found") return bad(error.message, 404);
      if (error.message.includes("locked") || error.message.startsWith("Repayment changed")) {
        return bad(error.message, 409);
      }
    }
    return toErrorResponse(error);
  }
}
