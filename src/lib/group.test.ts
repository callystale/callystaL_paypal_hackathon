import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBalances,
  settlementLocksExpenses,
  fromCents,
  splitEqually,
  suggestRepayments,
  toCents,
  type BalanceMember,
} from "./group";
import { paypalPaymentLink, settlementReferenceLabel } from "./payment-link";

const members: BalanceMember[] = [
  { id: "a", displayName: "You", isSelf: true },
  { id: "b", displayName: "Maya", isSelf: false },
  { id: "c", displayName: "Leo", isSelf: false },
];

test("equal split keeps every cent and is stable across input order", () => {
  const total = 8647; // $86.47 over three people leaves one cent.
  const first = splitEqually(total, ["c", "a", "b"]);
  const second = splitEqually(total, ["b", "c", "a"]);

  assert.deepEqual(first, second);
  assert.equal(
    first.reduce((sum, share) => sum + share.amountCents, 0),
    total,
  );
  assert.deepEqual(
    first.map((share) => share.amountCents),
    [2883, 2882, 2882],
  );
  assert.equal(fromCents(first[0].amountCents), 28.83);
});

test("split distributes leftovers one cent at a time", () => {
  assert.deepEqual(
    splitEqually(100, ["a", "b", "c"]).map((share) => share.amountCents),
    [34, 33, 33],
  );
  assert.equal(
    splitEqually(1, ["a", "b", "c"]).reduce(
      (sum, share) => sum + share.amountCents,
      0,
    ),
    1,
  );
});

test("split rejects an empty participant list", () => {
  assert.throws(() => splitEqually(100, []));
});

test("major-unit conversion is cent exact", () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(1.005), 101);
  assert.equal(fromCents(1234), 12.34);
});

test("balances credit the payer and debit each participant share", () => {
  const balances = computeBalances(
    members,
    [
      {
        payerId: "a",
        amountCents: 30000,
        shares: [
          { memberId: "a", amountCents: 10000 },
          { memberId: "b", amountCents: 10000 },
          { memberId: "c", amountCents: 10000 },
        ],
      },
      {
        payerId: "b",
        amountCents: 8647,
        shares: [
          { memberId: "a", amountCents: 2882 },
          { memberId: "b", amountCents: 2883 },
          { memberId: "c", amountCents: 2882 },
        ],
      },
    ],
    [],
  );

  const byId = new Map(balances.map((balance) => [balance.memberId, balance]));
  assert.equal(byId.get("a")!.netCents, 17118);
  assert.equal(byId.get("b")!.netCents, -4236);
  assert.equal(byId.get("c")!.netCents, -12882);
  assert.equal(
    balances.reduce((sum, balance) => sum + balance.netCents, 0),
    0,
  );
});

test("pending settlements do not move balances; settled ones do", () => {
  const expenses = [
    {
      payerId: "a",
      amountCents: 30000,
      shares: [
        { memberId: "a", amountCents: 10000 },
        { memberId: "b", amountCents: 10000 },
        { memberId: "c", amountCents: 10000 },
      ],
    },
  ];
  const pending = computeBalances(
    members,
    expenses,
    [{ senderId: "c", recipientId: "a", amountCents: 1000, status: "PENDING" }],
  );
  assert.equal(
    pending.find((balance) => balance.memberId === "c")!.netCents,
    -10000,
  );

  const settled = computeBalances(
    members,
    expenses,
    [{ senderId: "c", recipientId: "a", amountCents: 1000, status: "SETTLED" }],
  );
  assert.equal(
    settled.find((balance) => balance.memberId === "c")!.netCents,
    -9000,
  );
  assert.equal(
    settled.find((balance) => balance.memberId === "a")!.netCents,
    19000,
  );
});

test("repayment plan clears debts with fewer transfers than pairs", () => {
  const balances = computeBalances(
    members,
    [
      {
        payerId: "a",
        amountCents: 30000,
        shares: [
          { memberId: "a", amountCents: 10000 },
          { memberId: "b", amountCents: 10000 },
          { memberId: "c", amountCents: 10000 },
        ],
      },
      {
        payerId: "b",
        amountCents: 8647,
        shares: [
          { memberId: "a", amountCents: 2882 },
          { memberId: "b", amountCents: 2883 },
          { memberId: "c", amountCents: 2882 },
        ],
      },
    ],
    [],
  );

  const plan = suggestRepayments(balances);
  assert.deepEqual(
    plan.map((transfer) => ({
      from: transfer.fromMemberId,
      to: transfer.toMemberId,
      amount: transfer.amountCents,
    })),
    [
      { from: "c", to: "a", amount: 12882 },
      { from: "b", to: "a", amount: 4236 },
    ],
  );
  assert.equal(
    plan.reduce((sum, transfer) => sum + transfer.amountCents, 0),
    17118,
  );
});

test("a settled repayment clears the debt and needs no new transfer", () => {
  const balances = computeBalances(
    members,
    [
      {
        payerId: "a",
        amountCents: 500,
        shares: [{ memberId: "b", amountCents: 500 }],
      },
    ],
    [{ senderId: "b", recipientId: "a", amountCents: 500, status: "SETTLED" }],
  );
  assert.equal(
    balances.find((balance) => balance.memberId === "a")!.netCents,
    0,
  );
  assert.equal(
    balances.find((balance) => balance.memberId === "b")!.netCents,
    0,
  );
  assert.equal(suggestRepayments(balances).length, 0);
});

test("payment links support PayPal.Me handles and email addresses", () => {
  assert.equal(
    paypalPaymentLink("maya-demo", 4236, "USD"),
    "https://www.paypal.com/paypalme/maya-demo/42.36USD",
  );

  const email = paypalPaymentLink("maya@example.com", 4236, "EUR");
  assert.ok(email?.startsWith("https://www.paypal.com/donate/?"));
  const params = new URL(email!).searchParams;
  assert.equal(params.get("business"), "maya@example.com");
  assert.equal(params.get("amount"), "42.36");
  assert.equal(params.get("currency_code"), "EUR");

  assert.equal(paypalPaymentLink(null, 100, "USD"), null);
  assert.equal(paypalPaymentLink("   ", 100, "USD"), null);
});

test("payment references have friendly labels", () => {
  assert.equal(settlementReferenceLabel("payment-link"), "PayPal link request");
  assert.equal(
    settlementReferenceLabel("paypal-link-confirmed"),
    "PayPal link confirmed",
  );
  assert.equal(settlementReferenceLabel(null), null);
});


test("unpaid requests do not lock expense editing, but confirmed and processing payments do", () => {
  assert.equal(settlementLocksExpenses("PENDING"), false);
  assert.equal(settlementLocksExpenses("SETTLED"), true);
  assert.equal(settlementLocksExpenses("CAPTURING"), true);
});


test("reversing an unpaid repayment flips the debt and the new payment clears it", () => {
  const expenses = [{ payerId: "a", amountCents: 1000, shares: [{ memberId: "b", amountCents: 1000 }] }];
  const changes = [{ fromMemberId: "b", toMemberId: "a", amountCents: 1000 }];
  const balances = computeBalances(members, expenses, [], changes);
  assert.deepEqual(suggestRepayments(balances), [{
    fromMemberId: "a", fromName: "You", toMemberId: "b", toName: "Maya", amountCents: 1000,
  }]);
  assert.equal(balances.reduce((sum, row) => sum + row.netCents, 0), 0);
  assert.equal(balances.find((row) => row.memberId === "a")!.paidCents, 1000);
  assert.equal(balances.find((row) => row.memberId === "b")!.settledSentCents, 0);
  assert.deepEqual(suggestRepayments(computeBalances(members, expenses, [
    { senderId: "a", recipientId: "b", amountCents: 1000, status: "SETTLED" },
  ], changes)), []);
});

test("reversing the same repayment back restores the original balances", () => {
  const expenses = [{ payerId: "a", amountCents: 1001, shares: [{ memberId: "b", amountCents: 1001 }] }];
  assert.deepEqual(computeBalances(members, expenses, [], [
    { fromMemberId: "b", toMemberId: "a", amountCents: 1001 },
    { fromMemberId: "a", toMemberId: "b", amountCents: 1001 },
  ]), computeBalances(members, expenses, []));
});
