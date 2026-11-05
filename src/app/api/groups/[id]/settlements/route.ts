import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail, findGroupWithMembers } from "@/lib/group-data";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  amountCents: z.number().int().positive(),
  status: z.enum(["PENDING", "SETTLED"]).default("SETTLED"),
  note: z.string().trim().max(140).optional(),
  paymentReference: z.string().trim().max(140).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = createSchema.parse(await request.json());
    if (body.senderId === body.recipientId) {
      return bad("Sender and recipient must be different members", 400);
    }

    const group = await findGroupWithMembers(params.id);
    if (!group) return bad("Group not found", 404);
    const memberIds = new Set(group.members.map((member) => member.id));
    if (!memberIds.has(body.senderId) || !memberIds.has(body.recipientId)) {
      return bad("Both members must belong to this group", 400);
    }

    const settled = body.status === "SETTLED";
    const settlement = await prisma.settlement.create({
      data: {
        groupId: params.id,
        senderId: body.senderId,
        recipientId: body.recipientId,
        amountCents: body.amountCents,
        status: body.status,
        note: body.note || null,
        paymentReference: body.paymentReference || (settled ? "manual" : null),
        settledAt: settled ? new Date() : null,
      },
    });

    const detail = await findGroupDetail(params.id);
    return ok(
      {
        settlementId: settlement.id,
        group: detail ? toGroupDetailDTO(detail) : null,
      },
      201,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
