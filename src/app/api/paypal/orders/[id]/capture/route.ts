import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { itemEffectivePrice } from "@/lib/dto";
import { captureOrder, paypalConfigured, PayPalError } from "@/lib/paypal";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Tx = Prisma.TransactionClient;

/**
 * Records one budget purchase per item in a paid milestone and links each one
 * to the PayPal order. Repeated calls are safe: once an order has purchases,
 * they are never duplicated.
 */
async function recordMilestonePurchases(
  tx: Tx,
  orderId: string,
  milestoneId: string | null,
): Promise<void> {
  if (!milestoneId) return;
  const alreadyRecorded = await tx.purchase.count({ where: { orderId } });
  if (alreadyRecorded > 0) return;

  const milestone = await tx.milestone.findUnique({
    where: { id: milestoneId },
    include: { items: true },
  });
  if (!milestone || milestone.items.length === 0) return;

  // Milestone items store a category name; map it onto real budget categories.
  const categories = await tx.category.findMany({ select: { id: true, name: true } });
  const categoryByName = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  const occurredAt = new Date();

  for (const item of milestone.items) {
    await tx.purchase.create({
      data: {
        description: item.alternativeName ?? item.name,
        amount: itemEffectivePrice(item),
        merchant: "PayPal",
        categoryId: item.category
          ? categoryByName.get(item.category.trim().toLowerCase()) ?? null
          : null,
        orderId,
        occurredAt,
      },
    });
  }
}

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

    // Idempotent: a double click / retry returns the stored result instead of
    // asking PayPal to capture the same order twice.
    if (record.status === "COMPLETED") {
      // Backfill the budget for orders completed before purchases were linked.
      const milestoneId = record.milestoneId;
      if (milestoneId) {
        const recorded = await prisma.purchase.count({ where: { orderId: record.id } });
        if (recorded === 0) {
          await prisma.$transaction(async (tx) => {
            await recordMilestonePurchases(tx, record.id, milestoneId);
            await tx.desiredItem.updateMany({
              where: { milestoneId },
              data: { purchased: true },
            });
            await tx.milestone.update({
              where: { id: milestoneId },
              data: { status: "COMPLETED" },
            });
          });
        }
      }
      return ok({
        orderId: params.id,
        status: record.status,
        captureId: record.captureId ?? undefined,
        milestoneId: record.milestoneId,
      });
    }

    const capture = await captureOrder(params.id);
    const completed = capture.status === "COMPLETED";

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { paypalOrderId: params.id },
        data: {
          status: capture.status,
          captureId: capture.captureId ?? null,
        },
      });

      if (completed && record.milestoneId) {
        await tx.desiredItem.updateMany({
          where: { milestoneId: record.milestoneId },
          data: { purchased: true },
        });
        await tx.milestone.update({
          where: { id: record.milestoneId },
          data: { status: "COMPLETED" },
        });
        await recordMilestonePurchases(tx, record.id, record.milestoneId);
      }
    });

    return ok({
      orderId: capture.id,
      status: capture.status,
      captureId: capture.captureId,
      payerName: capture.payerName,
      milestoneId: record.milestoneId,
    });
  } catch (error) {
    if (error instanceof PayPalError) {
      console.error(
        `PayPal capture failed for ${params.id}: ${error.message}` +
          (error.debugId ? ` (debug_id: ${error.debugId})` : ""),
      );
      const status = error.issue === "INSTRUMENT_DECLINED" ? 402 : 502;
      return bad(error.message, status);
    }
    console.error(`PayPal capture error for ${params.id}:`, error);
    return toErrorResponse(error);
  }
}
