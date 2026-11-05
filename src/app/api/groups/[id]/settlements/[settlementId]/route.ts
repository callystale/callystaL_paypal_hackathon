import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { toGroupDetailDTO } from "@/lib/dto";
import { findGroupDetail } from "@/lib/group-data";

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

    if (settlement.status !== "SETTLED") {
      await prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          status: "SETTLED",
          settledAt: new Date(),
          paymentReference:
            body.paymentReference || settlement.paymentReference || "manual",
          ...(body.note !== undefined ? { note: body.note || null } : {}),
        },
      });
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
      select: { id: true, status: true },
    });
    if (!settlement) return bad("Settlement not found", 404);

    const deleted = await prisma.settlement.deleteMany({
      where: { id: settlement.id, status: { not: "CAPTURING" } },
    });
    if (!deleted.count) return bad("This payment is being processed and cannot be removed yet.", 409);
    return ok({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
