import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO, type GroupDetailPayload } from "@/lib/dto";
import { findGroupDetail, findGroupWithMembers } from "@/lib/group-data";
import { splitEqually, toCents } from "@/lib/group";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  description: z.string().trim().min(1).max(140),
  /** Amount in major units, e.g. 12.34. Converted to integer cents below. */
  amount: z.number().positive().max(1_000_000_000),
  payerId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  category: z.string().trim().max(60).optional(),
  participantIds: z.array(z.string().min(1)).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = createSchema.parse(await request.json());
    const group = await findGroupWithMembers(params.id);
    if (!group) return bad("Group not found", 404);

    const memberIds = new Set(group.members.map((member) => member.id));
    if (!memberIds.has(body.payerId)) {
      return bad("Payer must be a member of this group", 400);
    }

    const participantIds = [...new Set(body.participantIds)];
    const outsider = participantIds.find((id) => !memberIds.has(id));
    if (outsider) {
      return bad("Every participant must be a member of this group", 400);
    }

    const amountCents = toCents(body.amount);
    if (amountCents <= 0) {
      return bad("Amount must be at least one cent", 400);
    }

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return bad("Invalid expense date", 400);
    }

    const shares = splitEqually(amountCents, participantIds);
    const shareTotal = shares.reduce((sum, share) => sum + share.amountCents, 0);
    if (shareTotal !== amountCents) {
      return bad("Could not split the amount exactly; please try again", 400);
    }

    const expense = await prisma.groupExpense.create({
      data: {
        groupId: params.id,
        payerId: body.payerId,
        description: body.description,
        amountCents,
        category: body.category || null,
        occurredAt,
        shares: { create: shares },
      },
    });

    const detail = (await findGroupDetail(params.id)) as GroupDetailPayload;
    const dto = toGroupDetailDTO(detail);
    const created = dto.expenses.find((row) => row.id === expense.id) ?? null;

    return ok({ expense: created, group: dto }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
