import { validateRepayment } from "@/lib/group";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail, groupDetailInclude } from "@/lib/group-data";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.literal("SETTLED"),
  paymentReference: z.string().trim().max(140).optional(),
  note: z.string().trim().max(140).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; settlementId: string } },
) {
  try {
    const body = updateSchema.parse(await request.json());
    const settlement = await prisma.settlement.findFirst({
      where: { id: params.settlementId, groupId: params.id },
    });
    if (!settlement) return bad("Settlement not found", 404);

    if (settlement.status === "CAPTURING") {
      return bad("This payment is being processed. Retry PayPal confirmation before changing it.", 409);
    }

    if (settlement.paypalOrderId && settlement.status !== "SETTLED") {
      return bad("Confirm this payment through PayPal checkout instead of marking it settled manually.", 409);
    }
    if (settlement.status !== "SETTLED") {
      const error = await prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({ where: { id: params.id }, include: groupDetailInclude });
        if (!group) return "Group not found";
        const current = group.settlements.find((payment) => payment.id === settlement.id);
        if (!current || current.paypalOrderId || current.status === "CAPTURING") return "This payment request changed. Refresh the group.";
        if (current.status === "SETTLED") return null;
        if (group.settlements.some((payment) => payment.status === "CAPTURING")) return "A payment is being processed. Wait for confirmation.";
        const invalid = validateRepayment(toGroupDetailDTO(group).repayments, current.senderId, current.recipientId, current.amountCents);
        if (invalid) return invalid;
        await tx.settlement.update({ where: { id: current.id }, data: {
          status: "SETTLED", settledAt: new Date(),
          paymentReference: body.paymentReference || current.paymentReference || "manual",
          ...(body.note !== undefined ? { note: body.note || null } : {}),
        } });
        return null;
      });
      if (error) return bad(error, 409);
    }

    const detail = await findGroupDetail(params.id);
    return ok({ group: detail ? toGroupDetailDTO(detail) : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; settlementId: string } },
) {
  try {
    const settlement = await prisma.settlement.findFirst({
      where: { id: params.settlementId, groupId: params.id },
      select: { id: true, status: true, paypalOrderId: true },
    });
    if (!settlement) return bad("Settlement not found", 404);

    if (settlement.paypalOrderId && settlement.status === "SETTLED") {
      return bad("A completed PayPal payment cannot be erased from the ledger.", 409);
    }
    const deleted = await prisma.settlement.deleteMany({
      where: { id: settlement.id, status: { not: "CAPTURING" } },
    });
    if (!deleted.count) return bad("This payment is being processed and cannot be removed yet.", 409);
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
