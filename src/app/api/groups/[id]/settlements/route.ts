import { validateRepayment } from "@/lib/group";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail, groupDetailInclude } from "@/lib/group-data";

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

    const settled = body.status === "SETTLED";
    const settlement = await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id: params.id }, include: groupDetailInclude });
      if (!group) throw new Error("Group not found");
      const invalid = validateRepayment(toGroupDetailDTO(group).repayments, body.senderId, body.recipientId, body.amountCents);
      if (invalid) throw new Error(invalid);
      // A QR request only records an unpaid link. Keep the capture lock for
      // actions that change balances; checkout validates again before capture.
      if (settled && group.settlements.some((payment) => payment.status === "CAPTURING")) {
        throw new Error("A payment is being processed. Wait for confirmation before recording another payment.");
      }
      const existing = group.settlements.find((payment) => payment.status === "PENDING" &&
        payment.senderId === body.senderId && payment.recipientId === body.recipientId && payment.amountCents === body.amountCents);
      if (existing?.paypalOrderId && settled) throw new Error("Confirm this payment through PayPal checkout instead of marking it settled manually.");
      if (existing) {
        return settled ? tx.settlement.update({ where: { id: existing.id }, data: {
          status: "SETTLED", settledAt: new Date(), paymentReference: body.paymentReference || "manual", note: body.note || existing.note,
        } }) : existing;
      }
      return tx.settlement.create({ data: {
        groupId: params.id, senderId: body.senderId, recipientId: body.recipientId,
        amountCents: body.amountCents, status: body.status, note: body.note || null,
        paymentReference: body.paymentReference || (settled ? "manual" : null),
        settledAt: settled ? new Date() : null,
      } });
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
    if (error instanceof Error && !(error instanceof z.ZodError)) return bad(error.message, 409);
    return toErrorResponse(error);
  }
}
