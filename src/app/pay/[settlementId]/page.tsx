import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findGroupDetail } from "@/lib/group-data";
import { toGroupDetailDTO } from "@/lib/dto";
import { paypalClientId, paypalConfigured } from "@/lib/paypal";
import { SharedRepayment } from "@/components/SharedRepayment";

export const dynamic = "force-dynamic";

export default async function SharedPaymentPage({ params }: { params: { settlementId: string } }) {
  const request = await prisma.settlement.findUnique({ where: { id: params.settlementId } });
  if (!request) notFound();
  const source = await findGroupDetail(request.groupId);
  if (!source) notFound();
  const group = toGroupDetailDTO(source);
  const settlement = group.settlements.find((row) => row.id === request.id)!;
  // Share only the requested pair and payment, not the group's expense history.
  const sharedGroup = { ...group,
    members: group.members.filter((m) => m.id === request.senderId || m.id === request.recipientId),
    expenses: [], balances: [], directionChanges: [], settlements: [settlement],
    repayments: group.repayments.filter((r) => r.fromMemberId === request.senderId && r.toMemberId === request.recipientId),
  };
  return <SharedRepayment group={sharedGroup} settlement={settlement} paypal={{
    configured: paypalConfigured(), clientId: paypalClientId(),
    env: process.env.PAYPAL_ENV || "sandbox", currency: group.currency,
  }} />;
}
