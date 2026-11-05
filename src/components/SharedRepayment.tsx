"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GroupDetailDTO, SettlementDTO, StatusDTO, SuggestedRepayment } from "@/lib/client";
import { SettlementCheckoutModal } from "./SettlementCheckoutModal";
import { Alert, Money } from "./ui";
import { fromCents } from "@/lib/group";

export function SharedRepayment({ group, settlement, paypal }: {
  group: GroupDetailDTO; settlement: SettlementDTO; paypal: StatusDTO["paypal"];
}) {
  const router = useRouter();
  const [checkout, setCheckout] = useState(false);
  const [paid, setPaid] = useState(false);
  const remaining = group.repayments[0];
  const repayment: SuggestedRepayment | null = remaining ? {
    ...remaining, amountCents: Math.min(remaining.amountCents, settlement.amountCents),
  } : null;
  const settled = settlement.status === "SETTLED";
  const status: StatusDTO = { paypal, ollama: { configured: false, model: "", baseUrl: "" }, channel3: { configured: false } };
  return <main className="mx-auto max-w-lg px-5 py-12">
    <section className="card space-y-5 p-6">
      <p className="text-sm text-slate-400">{group.name} · Payment request</p>
      <h1 className="text-2xl font-semibold">{settlement.senderName} pays {settlement.recipientName}</h1>
      {paid && !settled && <Alert kind="info">Payment confirmed. Any remaining debt is shown below.</Alert>}
      {settled ? <Alert kind="info">This payment is already completed. No further payment is needed for this request.</Alert>
        : !repayment ? <Alert>This request is no longer payable. Ask for an updated payment request.</Alert>
        : <>
          <p className="text-3xl font-semibold"><Money amount={fromCents(repayment.amountCents)} currency={group.currency} /></p>
          <p className="text-sm text-slate-400">Sign in to the PayPal account saved for {settlement.senderName}. Review the recipient before approving payment.</p>
          <button className="btn-primary" onClick={() => setCheckout(true)}>Pay {settlement.recipientName}</button>
        </>}
    </section>
    <SettlementCheckoutModal group={group} repayment={checkout && !settled ? repayment : null} status={status}
      onClose={() => { setCheckout(false); router.refresh(); }}
      onPaid={(result) => { if (result.status === "SETTLED") { setPaid(true); setCheckout(false); } router.refresh(); }} />
  </main>;
}
