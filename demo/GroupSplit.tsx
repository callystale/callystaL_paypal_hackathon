import React, { useEffect, useRef, useState } from "react";
import { computeBalances, splitEqually, suggestRepayments, toCents, type BalanceSettlement, type SuggestedRepayment } from "../src/lib/group";
import { Money, Modal } from "../src/components/ui";

const members = [
  { id: "you", displayName: "You", isSelf: true },
  { id: "alex", displayName: "Alex", isSelf: false },
  { id: "sam", displayName: "Sam", isSelf: false },
];
const sampleExpenses = [
  { id: 1, description: "Dinner", payerId: "you", amountCents: 9000, shares: splitEqually(9000, members.map(m => m.id)) },
  { id: 2, description: "Transport", payerId: "alex", amountCents: 6000, shares: splitEqually(6000, members.map(m => m.id)) },
];

export function GroupSplit({ onClose }: { onClose: () => void }) {
  const [expenses, setExpenses] = useState(sampleExpenses);
  const [settlements, setSettlements] = useState<BalanceSettlement[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("you");
  const [payment, setPayment] = useState<SuggestedRepayment | null>(null);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const balances = computeBalances(members, expenses, settlements);
  const repayments = suggestRepayments(balances);
  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const settle = (repayment: SuggestedRepayment) => {
    setSettlements(current => [...current, { senderId: repayment.fromMemberId, recipientId: repayment.toMemberId, amountCents: repayment.amountCents, status: "SETTLED" }]);
    setNotice(`Demo repayment recorded: ${repayment.fromName} → ${repayment.toName}. No money moved.`);
  };
  return <section id="group-split" className="card" aria-labelledby="group-split-title">
    <header className="mb-5 flex items-start justify-between gap-3">
      <div><p className="mb-2 text-xs uppercase tracking-widest text-brand-400">Group sharing / split expenses</p><h2 id="group-split-title" ref={heading} tabIndex={-1}>Weekend with friends</h2><p className="mt-2 text-sm text-ink-muted">You, Alex, and Sam · USD</p></div>
      <button className="btn-ghost" aria-label="Close group split" onClick={onClose}>✕</button>
    </header>
    <p className="mb-5 rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3 text-xs text-cyan-100">Interactive sample group. Expenses and demo repayments update balances in this tab. PayPal is a walkthrough; no money moves. Balances are calculated, not AI generated.</p>
    {notice && <p role="status" className="mb-4 text-sm text-cyan-200">{notice}</p>}
    <div className="mb-5 flex items-center justify-between text-sm"><span className="text-ink-muted">Group spending</span><strong><Money amount={total / 100} /></strong></div>
    <div className="mb-6 grid grid-cols-3 gap-2">{balances.map(member => <div className="min-w-0 rounded-xl border border-paper-line bg-paper-base p-3" key={member.memberId}><p className="text-sm">{member.displayName}</p><p className={`mt-2 text-lg font-semibold ${member.netCents < 0 ? "text-rose-300" : "text-cyan-200"}`}><Money amount={Math.abs(member.netCents) / 100} /></p><p className="text-xs text-ink-muted">{member.netCents > 0 ? "to receive" : member.netCents < 0 ? "to repay" : "settled"}</p></div>)}</div>
    <h3 className="mb-3 font-semibold">Shared expenses</h3>
    <div className="mb-6 space-y-3">{expenses.map(expense => <div key={expense.id} className="flex items-start justify-between gap-3 border-b border-paper-line pb-3 text-sm"><div className="min-w-0"><p className="break-words">{expense.description}</p><p className="text-xs text-ink-muted">Paid by {members.find(m => m.id === expense.payerId)?.displayName} · split equally</p><p className="text-xs text-ink-muted">{expense.shares.map(share => `${members.find(m => m.id === share.memberId)?.displayName}: $${(share.amountCents / 100).toFixed(2)}`).join(" · ")}</p></div><Money className="shrink-0" amount={expense.amountCents / 100} /></div>)}</div>
    <form className="mb-6 space-y-3 rounded-xl border border-paper-line bg-paper-base p-4" onSubmit={event => {
      event.preventDefault(); const cents = toCents(Number(amount));
      if (!description.trim() || !Number.isSafeInteger(cents) || cents < 1 || cents > 10000000) return;
      setExpenses(current => [...current, { id: Date.now(), description: description.trim(), payerId: payer, amountCents: cents, shares: splitEqually(cents, members.map(m => m.id)) }]);
      setDescription(""); setAmount(""); setNotice("Shared expense added. Everyone’s share and suggested repayments have been recalculated.");
    }}><h3 className="font-semibold">Add a shared expense</h3><label className="label">Description<input className="input mt-1" required maxLength={100} value={description} onChange={event => setDescription(event.target.value)} placeholder="e.g. Hotel or groceries" /></label><div className="grid grid-cols-2 gap-3"><label className="label">Amount (USD)<input className="input mt-1" type="number" min="0.01" max="100000" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="label">Paid by<select className="input mt-1" value={payer} onChange={event => setPayer(event.target.value)}>{members.map(member => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label></div><button className="btn-secondary w-full" type="submit">Add expense & split equally</button></form>
    <h3 className="mb-3 font-semibold">Suggested repayments</h3>
    {!repayments.length && <p role="status" className="mb-4 text-sm text-cyan-200">All settled in this demo.</p>}
    <div className="space-y-3">{repayments.map(repayment => <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4" key={`${repayment.fromMemberId}-${repayment.toMemberId}`}><p className="mb-3 text-sm font-semibold">{repayment.fromName} → {repayment.toName} <span className="float-right"><Money amount={repayment.amountCents / 100} /></span></p><div className="flex flex-wrap gap-2"><button className="btn-primary btn-sm" onClick={() => setPayment(repayment)}>Preview PayPal repayment</button><button className="btn-secondary btn-sm" onClick={() => settle(repayment)}>Mark settled (demo)</button></div></div>)}</div>
    <button className="btn-ghost mt-5 w-full" onClick={() => { setExpenses(sampleExpenses); setSettlements([]); setNotice("Sample group reset."); }}>Reset sample group</button>
    <Modal open={payment !== null} onClose={() => setPayment(null)} title="Group repayment with PayPal">
      {payment && <><p className="mb-4 text-sm">{payment.fromName} would send <Money amount={payment.amountCents / 100} /> to {payment.toName}.</p><ol className="list-decimal space-y-3 pl-5 text-sm text-ink-soft"><li>BudgetPal creates a Sandbox order for the recipient.</li><li>The sender reviews and approves checkout with PayPal.</li><li>The server verifies capture before settling the debt.</li></ol><p className="mt-4 rounded-lg border border-paper-line p-3 text-xs text-cyan-100">This is a walkthrough. No order was created and no payment was made. Use “Mark settled (demo)” to explore the balance changes.</p><button className="btn-secondary mt-4" onClick={() => setPayment(null)}>Back to group split</button></>}
    </Modal>
  </section>;
}
