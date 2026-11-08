import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { itemEffectivePrice } from "@/lib/dto";
import { currency, round2 } from "@/lib/money";
import { createOrder, paypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ itemIds: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ milestoneId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    if (!paypalConfigured()) {
      return bad(
        "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.",
        503,
      );
    }

    const selection = schema.parse(await request.json());
    const ids = "itemIds" in selection ? [...new Set(selection.itemIds)] : null;
    const items = await prisma.desiredItem.findMany({
      where: ids ? { id: { in: ids } } : { milestoneId: "milestoneId" in selection ? selection.milestoneId : "" },
    });
    if (!items.length || (ids && items.length !== ids.length)) return bad("Selected items not found", 404);
    if (items.some((item) => item.purchased || !item.milestoneId)) {
      return bad("Select unpaid items from your current plan", 409);
    }
    const milestoneIds = [...new Set(items.map((item) => item.milestoneId!))];
    const milestone = milestoneIds.length === 1
      ? await prisma.milestone.findUnique({ where: { id: milestoneIds[0] } }) : null;
    const title = milestone?.title ?? "Selected plan items";
    const checkoutItems = JSON.stringify(items.map((item) => ({
      id: item.id, name: item.alternativeName ?? item.name,
      amount: itemEffectivePrice(item), category: item.category, milestoneId: item.milestoneId,
    })));

    const lines = items.map((item) => ({
      name: item.alternativeName ? `${item.name} (alt: ${item.alternativeName})` : item.name,
      amount: itemEffectivePrice(item),
    }));
    const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    if (total <= 0) return bad("Milestone total must be positive", 400);

    const currencyCode = currency();
    const order = await createOrder({
      amount: total,
      currency: currencyCode,
      description: `Budget planner — ${title}`,
      referenceId: milestone?.id,
      lines,
    });

    await prisma.order.create({
      data: {
        paypalOrderId: order.id,
        milestoneId: milestone?.id ?? null,
        milestoneTitle: title,
        checkoutItems,
        amount: total,
        currency: currencyCode,
        status: order.status,
      },
    });

    return ok({
      orderId: order.id,
      status: order.status,
      amount: total,
      currency: currencyCode,
      milestoneId: milestone?.id ?? null,
      milestoneTitle: title,
      lines,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
