import { memberPaypalEmailSchema } from "@/lib/group-member";
import { fromCents, remainingExpenseShare, validateRepayment } from "@/lib/group";
import { groupDetailInclude } from "@/lib/group-data";
import { toGroupDetailDTO } from "@/lib/dto";
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
      include: { sender: true, recipient: true, group: true },
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

    const senderEmail = memberPaypalEmailSchema.safeParse(settlement.sender.paypalAddress);
    if (!senderEmail.success) return bad("Add a valid PayPal email for the sender before paying", 400);

    const recipientEmail = memberPaypalEmailSchema.safeParse(settlement.recipient.paypalAddress);
    if (!recipientEmail.success) return bad("Add a valid PayPal email for the recipient before paying", 400);

    // Serialize validation and the claim so two different orders cannot pay the same debt.
    const claimError = await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({ where: { id: params.id }, include: groupDetailInclude });
      if (!group) return "Group not found";
      const current = group.settlements.find((payment) => payment.id === settlement.id);
      if (!current || !["PENDING", "CAPTURING"].includes(current.status)) {
        return "This payment request changed. Refresh the group before paying.";
      }
      if (current.status === "PENDING") {
        if (current.expenseId && current.amountCents > remainingExpenseShare(toGroupDetailDTO(group), current.expenseId, current.senderId, true)) {
          return "This expense share is already paid or being processed. Refresh the group.";
        }
        const invalid = validateRepayment(toGroupDetailDTO(group).repayments, current.senderId, current.recipientId, current.amountCents);
        if (invalid) return invalid;
        // Reserve in-flight transfers for validation only. They remain unpaid
        // in the ledger until PayPal confirms completion. Independent debts can
        // proceed, but another order cannot spend the same remaining debt.
        const reserved = toGroupDetailDTO({
          ...group,
          settlements: group.settlements.map((payment) => ({
            ...payment,
            status: payment.status === "CAPTURING" ? "SETTLED" : payment.status,
          })),
        });
        if (validateRepayment(reserved.repayments, current.senderId, current.recipientId, current.amountCents)) {
          return "Another payment is already processing this debt. Wait for confirmation before paying it again.";
        }
      }
      await tx.settlement.update({ where: { id: settlement.id }, data: { status: "CAPTURING" } });
      return null;
    });
    if (claimError) return bad(claimError, 409);

    const capture = await captureOrder(settlement.paypalOrderId, senderEmail.data, { payeeEmail: recipientEmail.data, amount: fromCents(settlement.amountCents), currency: settlement.group.currency });
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
      if (error.issue === "INSTRUMENT_DECLINED" || error.issue === "ORDER_NOT_APPROVED" || error.issue === "PAYER_ACCOUNT_MISMATCH" || error.issue === "PAYMENT_DETAILS_MISMATCH") {
        await prisma.settlement.updateMany({
          where: { id: params.settlementId, groupId: params.id, status: "CAPTURING" },
          data: { status: "PENDING" },
        });
      }
      console.error(
        `PayPal group settlement capture failed for ${params.settlementId}: ${error.message}` +
          (error.debugId ? ` (debug_id: ${error.debugId})` : ""),
      );
      const status = ["PAYER_ACCOUNT_MISMATCH", "PAYMENT_DETAILS_MISMATCH"].includes(error.issue || "") ? 409 : error.issue === "INSTRUMENT_DECLINED" ? 402 : 502;
      return bad(error.message, status);
    }
    console.error(`PayPal group settlement capture error for ${params.settlementId}:`, error);
    return toErrorResponse(error);
  }
}
