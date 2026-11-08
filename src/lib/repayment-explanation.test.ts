import test from "node:test";
import assert from "node:assert/strict";
import { computeBalances, repaymentPlan, type GroupDetailDTO } from "./group";
import { repaymentExplanation } from "./repayment-explanation";

function example(): GroupDetailDTO {
  const members = [
    { id: "n", displayName: "Nguyen", isSelf: false, paypalAddress: null, createdAt: "" },
    { id: "u", displayName: "You", isSelf: true, paypalAddress: null, createdAt: "" },
    { id: "m", displayName: "Mia", isSelf: false, paypalAddress: null, createdAt: "" },
  ];
  const shares = (entries: Array<[string, string, number]>) => entries.map(([memberId, memberName, amountCents]) => ({ id: memberId, memberId, memberName, amountCents, isSelf: memberId === "u", purchaseId: null }));
  const expenses = [
    { id: "hotel", description: "Hotels", amountCents: 100000, category: null, occurredAt: "", payerId: "u", payerName: "You", shares: shares([["n", "Nguyen", 50000], ["u", "You", 50000]]) },
    { id: "train", description: "Train", amountCents: 90000, category: null, occurredAt: "", payerId: "m", payerName: "Mia", shares: shares([["n", "Nguyen", 30000], ["u", "You", 30000], ["m", "Mia", 30000]]) },
  ];
  return { id: "g", name: "Trip", currency: "USD", createdAt: "", members, expenses, settlements: [], directionChanges: [], balances: computeBalances(members, expenses, []), repayments: repaymentPlan(members, expenses, [], []), totals: { spentCents: 190000, yourNetCents: 20000 } };
}

test("explains the original expense shares and Nguyen's payment on your behalf", () => {
  const info = repaymentExplanation(example());
  assert.deepEqual(info.original.map((fact) => fact.text), [
    "Nguyen owes You $500.00 for Hotels.",
    "Nguyen owes Mia $300.00 for Train.",
    "You owe Mia $300.00 for Train.",
  ]);
  assert.ok(info.shortcuts.some((fact) => fact.text === "Nguyen pays Mia $300.00 on behalf of You, clearing a chain of debts."));
  assert.deepEqual(info.transfers.map((fact) => fact.text), ["Nguyen pays Mia $600.00.", "Nguyen pays You $200.00."]);
  assert.ok(info.balances.some((fact) => fact.text.includes("= is owed $200.00")));
});

test("explains completed payments and avoids inventing a shortcut for historical corrections", () => {
  const group = example();
  group.settlements = [{ id: "p", senderId: "n", senderName: "Nguyen", recipientId: "m", recipientName: "Mia", amountCents: 10000, status: "SETTLED", paypalOrderId: null, paymentReference: null, note: null, settledAt: null, createdAt: "" }];
  group.balances = computeBalances(group.members, group.expenses, group.settlements);
  group.repayments = repaymentPlan(group.members, group.expenses, group.settlements, []);
  const info = repaymentExplanation(group);
  assert.ok(info.changes.some((fact) => fact.text.includes("Nguyen has already paid Mia $100.00")));
  assert.equal(info.shortcuts.length, 0);
  assert.ok(info.transfers.some((fact) => fact.text === "Nguyen pays Mia $500.00."));
});

test("shows opposite debts cancelling and ignores pending requests", () => {
  const group = example();
  group.expenses = [
    { ...group.expenses[0], id: "one", shares: [{ ...group.expenses[0].shares[0], amountCents: 5000 }] },
    { ...group.expenses[1], id: "two", payerId: "n", payerName: "Nguyen", shares: [{ ...group.expenses[0].shares[1], amountCents: 3000 }] },
  ];
  // Use expense totals consistent with their recorded shares for the balance calculation.
  group.expenses[0].amountCents = 5000;
  group.expenses[1].amountCents = 3000;
  group.settlements = [{ id: "p", senderId: "n", senderName: "Nguyen", recipientId: "u", recipientName: "You", amountCents: 2000, status: "PENDING", paypalOrderId: null, paymentReference: null, note: null, settledAt: null, createdAt: "" }];
  group.balances = computeBalances(group.members, group.expenses, group.settlements);
  group.repayments = repaymentPlan(group.members, group.expenses, group.settlements, []);
  const info = repaymentExplanation(group);
  assert.ok(info.shortcuts.some((fact) => fact.text.includes("each owe the other $30.00")));
  assert.ok(info.changes.some((fact) => fact.id === "unconfirmed"));
  assert.deepEqual(info.transfers.map((fact) => fact.text), ["Nguyen pays You $20.00."]);
});
