import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { captureOrder, paypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!paypalConfigured()) {
      return bad("PayPal is not configured.", 503);
    }

    const record = await prisma.order.findUnique({
      where: { paypalOrderId: params.id },
    });
    if (!record) return bad("Order not found", 404);

    const capture = await captureOrder(params.id);
    const completed = capture.status === "COMPLETED";

    await prisma.order.update({
      where: { paypalOrderId: params.id },
      data: {
        status: capture.status,
        captureId: capture.captureId ?? null,
      },
    });

    if (completed && record.milestoneId) {
      await prisma.$transaction([
        prisma.desiredItem.updateMany({
          where: { milestoneId: record.milestoneId },
          data: { purchased: true },
        }),
        prisma.milestone.update({
          where: { id: record.milestoneId },
          data: { status: "COMPLETED" },
        }),
      ]);
    }

    return ok({
      orderId: capture.id,
      status: capture.status,
      captureId: capture.captureId,
      payerName: capture.payerName,
      milestoneId: record.milestoneId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
