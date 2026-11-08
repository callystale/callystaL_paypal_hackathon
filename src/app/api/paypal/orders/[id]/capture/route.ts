import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { itemEffectivePrice } from "@/lib/dto";
import { captureOrder, paypalConfigured, PayPalError } from "@/lib/paypal";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Tx = Prisma.TransactionClient;

/**
 * Records one budget purchase per selected item and links each one
 * to the PayPal order. Repeated calls are safe: once an order has purchases,
 * they are never duplicated.
 */
async function recordMilestonePurchases(
  tx: Tx,
  orderId: string,
  milestoneId: string | null,
  checkoutItems: string | null,
): Promise<void> {
  if (!milestoneId && !checkoutItems) return;
  const alreadyRecorded = await tx.purchase.count({ where: { orderId } });
  if (alreadyRecorded > 0) return;

  const milestone = milestoneId ? await tx.milestone.findUnique({
    where: { id: milestoneId }, include: { items: true },
  }) : null;
  const items: Array<{ id: string; name: string; amount: number; category: string | null }> = checkoutItems
    ? JSON.parse(checkoutItems)
    : (milestone?.items ?? []).map((item) => ({
        id: item.id, name: item.alternativeName ?? item.name,
        amount: itemEffectivePrice(item), category: item.category,
      }));
  if (!items.length) return;
  // Use current membership so a regenerated plan is updated correctly too.
  const currentItems = await tx.desiredItem.findMany({ where: { id: { in: items.map((i) => i.id) } } });

  // Milestone items store a category name; map it onto real budget categories.
  const categories = await tx.category.findMany({ select: { id: true, name: true } });
  const categoryByName = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  const occurredAt = new Date();

  for (const item of items) {
    await tx.purchase.create({
      data: {
        description: item.name,
        amount: item.amount,
        merchant: "PayPal",
        categoryId: item.category
          ? categoryByName.get(item.category.trim().toLowerCase()) ?? null
          : null,
        orderId,
        occurredAt,
      },
    });
  }
  await tx.desiredItem.updateMany({
    where: { id: { in: items.map((item) => item.id) } }, data: { purchased: true },
  });
  for (const id of new Set(currentItems.map((item) => item.milestoneId).filter((id): id is string => Boolean(id)))) {
    const remaining = await tx.desiredItem.count({ where: { milestoneId: id, purchased: false } });
    await tx.milestone.update({ where: { id }, data: { status: remaining ? "PLANNED" : "COMPLETED" } });
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
      await prisma.$transaction((tx) => recordMilestonePurchases(tx, record.id, record.milestoneId, record.checkoutItems));
      return ok({
        orderId: params.id,
        status: record.status,
        captureId: record.captureId ?? undefined,
        milestoneId: record.milestoneId,
      });
    }

    if (record.checkoutItems) {
      const selected = JSON.parse(record.checkoutItems) as Array<{ id: string }>;
      const paid = await prisma.desiredItem.count({
        where: { id: { in: selected.map((item) => item.id) }, purchased: true },
      });
      if (paid) return bad("Some selected items have already been paid. Start a new checkout for the remaining items.", 409);
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

      if (completed) {
        await recordMilestonePurchases(tx, record.id, record.milestoneId, record.checkoutItems);
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
