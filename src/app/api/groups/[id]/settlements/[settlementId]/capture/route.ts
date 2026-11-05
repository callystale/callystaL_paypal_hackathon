import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { captureOrder, paypalConfigured, PayPalError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; settlementId: string } },
) {
  try {
    if (!paypalConfigured()) {
      return bad("PayPal is not configured.", 503);
    }

    const settlement = await prisma.settlement.findFirst({
      where: { id: params.settlementId, groupId: params.id },
    });
    if (!settlement) return bad("Settlement not found", 404);

    // A double click (or a retry after a timeout) returns the stored result.
    if (settlement.status === "SETTLED") {
      return ok({
        settlementId: settlement.id,
        status: settlement.status,
        captureId: settlement.paymentReference ?? undefined,
        groupId: settlement.groupId,
      });
    }

    if (!settlement.paypalOrderId) {
      return bad("This settlement has no PayPal order to capture", 400);
    }

    // Claim the request before contacting PayPal. Expense edits can delete an
    // unpaid PENDING request, but must never race with a capture in progress.
    const claimed = await prisma.settlement.updateMany({
      where: {
        id: settlement.id,
        groupId: params.id,
        status: { in: ["PENDING", "CAPTURING"] },
      },
      data: { status: "CAPTURING" },
    });
    if (!claimed.count) return bad("This payment request changed. Refresh the group before paying.", 409);

    const capture = await captureOrder(settlement.paypalOrderId);
    const completed = capture.status === "COMPLETED";

    if (completed) {
      await prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          status: "SETTLED",
          paymentReference: capture.captureId ?? settlement.paypalOrderId,
          settledAt: new Date(),
        },
      });
    }

    return ok({
      settlementId: settlement.id,
      status: completed ? "SETTLED" : capture.status,
      captureId: capture.captureId,
      payerName: capture.payerName,
      groupId: settlement.groupId,
    });
  } catch (error) {
    if (error instanceof PayPalError) {
      // A definitive PayPal rejection is unpaid. For network errors or server
      // failures retain CAPTURING until a retry reconciles the actual result.
      if (error.issue === "INSTRUMENT_DECLINED" || error.issue === "ORDER_NOT_APPROVED") {
        await prisma.settlement.updateMany({
          where: { id: params.settlementId, groupId: params.id, status: "CAPTURING" },
          data: { status: "PENDING" },
        });
      }
      console.error(
        `PayPal group settlement capture failed for ${params.settlementId}: ${error.message}` +
          (error.debugId ? ` (debug_id: ${error.debugId})` : ""),
      );
      const status = error.issue === "INSTRUMENT_DECLINED" ? 402 : 502;
      return bad(error.message, status);
    }
    console.error(`PayPal group settlement capture error for ${params.settlementId}:`, error);
    return toErrorResponse(error);
  }
}
