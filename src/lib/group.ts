/**
 * Pure group-splitting logic.
 *
 * All money in this module is handled in integer minor units (cents). Keeping
 * the arithmetic integral means an expense's shares always add up to its total
 * and net balances never drift because of floating-point rounding.
 */

/** Pending requests are unpaid; only completed or actively capturing payments lock edits. */
export function settlementLocksExpenses(status: string): boolean {
  return status === "SETTLED" || status === "CAPTURING";
}

export const GROUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

/** Convert a major-unit amount (e.g. 12.34) to integer cents. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

/** Convert integer cents back to a major-unit amount for display/PayPal. */
export function fromCents(cents: number): number {
  return cents / 100;
}

export interface ShareSplit {
  memberId: string;
  amountCents: number;
}

/**
 * Split a total evenly between participants, distributing leftover cents one
 * at a time. Sorting the member ids makes the result independent of the order
 * participants were submitted in, so re-opening and saving an expense cannot
 * silently move a cent between people.
 */
export function splitEqually(totalCents: number, participantIds: string[]): ShareSplit[] {
  const participants = [...new Set(participantIds)].sort();
  if (participants.length === 0) {
    throw new Error("At least one participant is required");
  }
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Amount must be a non-negative integer number of cents");
  }

  const base = Math.floor(totalCents / participants.length);
  const remainder = totalCents % participants.length;

  return participants.map((memberId, index) => ({
    memberId,
    amountCents: base + (index < remainder ? 1 : 0),
  }));
}

export interface BalanceMember {
  id: string;
  displayName: string;
  isSelf: boolean;
}

export interface BalanceExpense {
  payerId: string;
  amountCents: number;
  shares: Array<{ memberId: string; amountCents: number }>;
}

export interface BalanceSettlement {
  senderId: string;
  recipientId: string;
  amountCents: number;
  status: string;
}

export interface BalanceDirectionChange {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface MemberBalance {
  memberId: string;
  displayName: string;
  isSelf: boolean;
  paidCents: number;
  shareCents: number;
  settledSentCents: number;
  settledReceivedCents: number;
  directionAdjustmentCents: number;
  /** Positive = the member is owed money; negative = the member owes money. */
  netCents: number;
}

/**
 * Net balance = what a member paid - their own shares + settlements they sent
 * - settlements they received. Only SETTLED transfers move the balance; a
 * pending PayPal request must not make a debt look paid.
 */
export function computeBalances(
  members: BalanceMember[],
  expenses: BalanceExpense[],
  settlements: BalanceSettlement[],
  directionChanges: BalanceDirectionChange[] = [],
): MemberBalance[] {
  const byId = new Map(
    members.map((member) => [
      member.id,
      {
        memberId: member.id,
        displayName: member.displayName,
        isSelf: member.isSelf,
        paidCents: 0,
        shareCents: 0,
        settledSentCents: 0,
        settledReceivedCents: 0,
        directionAdjustmentCents: 0,
        netCents: 0,
      } satisfies MemberBalance,
    ]),
  );

  for (const expense of expenses) {
    const payer = byId.get(expense.payerId);
    if (payer) payer.paidCents += expense.amountCents;
    for (const share of expense.shares) {
      const member = byId.get(share.memberId);
      if (member) member.shareCents += share.amountCents;
    }
  }

  // Reversing A owes B $10 must remove that debt AND establish B owes A $10.
  // This is a $20 balance correction, recorded separately from actual payments.
  for (const change of directionChanges) {
    const from = byId.get(change.fromMemberId);
    const to = byId.get(change.toMemberId);
    if (from && to) {
      from.directionAdjustmentCents += change.amountCents * 2;
      to.directionAdjustmentCents -= change.amountCents * 2;
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== "SETTLED") continue;
    const sender = byId.get(settlement.senderId);
    const recipient = byId.get(settlement.recipientId);
    if (sender) sender.settledSentCents += settlement.amountCents;
    if (recipient) recipient.settledReceivedCents += settlement.amountCents;
  }

  return members.map((member) => {
    const row = byId.get(member.id)!;
    row.netCents =
      row.paidCents - row.shareCents + row.settledSentCents - row.settledReceivedCents + row.directionAdjustmentCents;
    return row;
  });
}

export interface SuggestedRepayment {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountCents: number;
}

/**
 * Greedy debt simplification: repeatedly match the member who owes the most
 * with the member who is owed the most. Every match clears at least one side,
 * so the plan uses at most (debtors + creditors - 1) transfers.
 */
export function suggestRepayments(balances: MemberBalance[]): SuggestedRepayment[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ ...b, remaining: -b.netCents }))
    .sort((a, b) => b.remaining - a.remaining || a.memberId.localeCompare(b.memberId));
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ ...b, remaining: b.netCents }))
    .sort((a, b) => b.remaining - a.remaining || a.memberId.localeCompare(b.memberId));

  const plan: SuggestedRepayment[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);

    if (amountCents > 0) {
      plan.push({
        fromMemberId: debtor.memberId,
        fromName: debtor.displayName,
        toMemberId: creditor.memberId,
        toName: creditor.displayName,
        amountCents,
      });
      debtor.remaining -= amountCents;
      creditor.remaining -= amountCents;
    }

    if (debtor.remaining === 0) d += 1;
    if (creditor.remaining === 0) c += 1;
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Wire-level DTOs shared by the API and the client.
// ---------------------------------------------------------------------------

export interface GroupMemberDTO {
  id: string;
  displayName: string;
  isSelf: boolean;
  /** PayPal email or PayPal.Me handle used for request/pay links. */
  paypalAddress: string | null;
  createdAt: string;
}

export interface GroupShareDTO {
  id: string;
  memberId: string;
  memberName: string;
  isSelf: boolean;
  amountCents: number;
  /** Set when this share has been copied into the personal budget. */
  purchaseId: string | null;
}

export interface GroupExpenseDTO {
  id: string;
  description: string;
  amountCents: number;
  category: string | null;
  occurredAt: string;
  payerId: string;
  payerName: string;
  shares: GroupShareDTO[];
}

export interface SettlementDTO {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  amountCents: number;
  status: string;
  paypalOrderId: string | null;
  paymentReference: string | null;
  note: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface GroupSummaryDTO {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  memberCount: number;
  expenseCount: number;
  selfMemberId: string | null;
  selfName: string | null;
}

export interface DirectionChangeDTO extends BalanceDirectionChange {
  id: string;
  fromName: string;
  toName: string;
  createdAt: string;
}

export interface GroupDetailDTO {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  members: GroupMemberDTO[];
  expenses: GroupExpenseDTO[];
  settlements: SettlementDTO[];
  balances: MemberBalance[];
  repayments: SuggestedRepayment[];
  directionChanges: DirectionChangeDTO[];
  totals: {
    spentCents: number;
    /** The local user's net position, or null when no member is marked "you". */
    yourNetCents: number | null;
  };
}
