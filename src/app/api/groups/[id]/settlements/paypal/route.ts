import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bad, ok, toErrorResponse } from "@/lib/api";
import { createOrder, paypalConfigured } from "@/lib/paypal";
import { findGroupDetail } from "@/lib/group-data";
import { memberPaypalEmailSchema } from "@/lib/group-member";
import { toGroupDetailDTO } from "@/lib/dto";
import { fromCents, validateRepayment } from "@/lib/group";

export const dynamic = "force-dynamic";

const schema = z.object({
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    if (!paypalConfigured()) {
      return bad(
        "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.",
        503,
      );
    }

    const body = schema.parse(await request.json());
    if (body.senderId === body.recipientId) {
      return bad("Sender and recipient must be different members", 400);
    }

    const group = await findGroupDetail(params.id);
    if (!group) return bad("Group not found", 404);
    const sender = group.members.find((member) => member.id === body.senderId);
    const recipient = group.members.find((member) => member.id === body.recipientId);
    if (!sender || !recipient) {
      return bad("Both members must belong to this group", 400);
    }

    if (!memberPaypalEmailSchema.safeParse(sender.paypalAddress).success) {
      return bad("Add a valid PayPal email for the sender before paying", 400);
    }
    const payee = memberPaypalEmailSchema.safeParse(recipient.paypalAddress);
    if (!payee.success) {
      return bad("Add a valid PayPal email for the recipient before paying", 400);
    }

    const invalid = validateRepayment(toGroupDetailDTO(group).repayments, sender.id, recipient.id, body.amountCents);
    if (invalid) return bad(invalid, 409);
    const existing = group.settlements.find((payment) =>
      payment.senderId === sender.id && payment.recipientId === recipient.id &&
      payment.amountCents === body.amountCents && payment.paypalOrderId &&
      (payment.status === "PENDING" || payment.status === "CAPTURING"),
    );
    if (existing) {
      return ok({ settlementId: existing.id, orderId: existing.paypalOrderId, status: existing.status,
        amountCents: existing.amountCents, currency: group.currency,
        senderName: sender.displayName, recipientName: recipient.displayName });
    }

    const order = await createOrder({
      payeeEmail: payee.data,
      noShipping: true,
      amount: fromCents(body.amountCents),
      currency: group.currency,
      description: `${sender.displayName} → ${recipient.displayName} · ${group.name}`,
      referenceId: group.id,
    });

    const linkRequest = group.settlements.find((payment) => payment.status === "PENDING" && !payment.paypalOrderId &&
      payment.senderId === sender.id && payment.recipientId === recipient.id && payment.amountCents === body.amountCents);
    const settlement = linkRequest ? await prisma.settlement.update({
      where: { id: linkRequest.id },
      data: { paypalOrderId: order.id, note: "PayPal checkout from shared request" },
    }) : await prisma.settlement.create({
      data: {
        groupId: group.id,
        senderId: sender.id,
        recipientId: recipient.id,
        amountCents: body.amountCents,
        status: "PENDING",
        paypalOrderId: order.id,
        note: "PayPal Sandbox settlement",
      },
    });

    return ok(
      {
        settlementId: settlement.id,
        orderId: order.id,
        status: order.status,
        amountCents: body.amountCents,
        currency: group.currency,
        senderName: sender.displayName,
        recipientName: recipient.displayName,
      },
      201,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
