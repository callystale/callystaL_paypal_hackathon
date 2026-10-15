import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { itemEffectivePrice } from "@/lib/dto";
import { currency, round2 } from "@/lib/money";
import { createOrder, paypalConfigured } from "@/lib/paypal";

export const dynamic = "force-dynamic";

const schema = z.object({ milestoneId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    if (!paypalConfigured()) {
      return bad(
        "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.",
        503,
      );
    }

    const { milestoneId } = schema.parse(await request.json());

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { items: true },
    });
    if (!milestone) return bad("Milestone not found", 404);
    if (milestone.items.length === 0) return bad("Milestone has no items", 400);

    const lines = milestone.items.map((item) => ({
      name: item.alternativeName ? `${item.name} (alt: ${item.alternativeName})` : item.name,
      amount: itemEffectivePrice(item),
    }));
    const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    if (total <= 0) return bad("Milestone total must be positive", 400);

    const currencyCode = currency();
    const order = await createOrder({
      amount: total,
      currency: currencyCode,
      description: `Budget planner — ${milestone.title}`,
      referenceId: milestone.id,
      lines,
    });

    await prisma.order.create({
      data: {
        paypalOrderId: order.id,
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
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
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      lines,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
