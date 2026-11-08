import type { GroupDetailDTO, SuggestedRepayment } from "./group";
import { formatCurrency } from "./money";

export interface RepaymentFact {
  id: string;
  text: string;
}

interface Edge { from: string; to: string; cents: number }

/** Derive facts from the actual expense shares and the server's current payment plan. */
export function repaymentExplanation(group: GroupDetailDTO): {
  original: RepaymentFact[];
  changes: RepaymentFact[];
  balances: RepaymentFact[];
  transfers: RepaymentFact[];
  shortcuts: RepaymentFact[];
} {
  const names = new Map(group.members.map((member) => [member.id, member.displayName]));
  const name = (id: string) => names.get(id) ?? "Unknown member";
  const verb = (id: string, singular: string, plural: string) => name(id).toLowerCase() === "you" ? plural : singular;
  const money = (cents: number) => formatCurrency(cents / 100, group.currency);
  const original: RepaymentFact[] = [];
  const edges: Edge[] = [];
  for (const expense of group.expenses) {
    for (const share of expense.shares) {
      if (share.memberId === expense.payerId || share.amountCents <= 0) continue;
      original.push({ id: `expense-${expense.id}-${share.id}`, text: `${share.memberName} ${verb(share.memberId, "owes", "owe")} ${expense.payerName} ${money(share.amountCents)} for ${expense.description}.` });
      const edge = edges.find((item) => item.from === share.memberId && item.to === expense.payerId);
      if (edge) edge.cents += share.amountCents;
      else edges.push({ from: share.memberId, to: expense.payerId, cents: share.amountCents });
    }
  }
  const changes: RepaymentFact[] = group.directionChanges.map((change) => ({
    id: `correction-${change.id}`,
    text: `A saved direction correction changed ${change.fromName} owing ${change.toName} ${money(change.amountCents)} to ${change.toName} owing ${change.fromName} ${money(change.amountCents)}.`,
  }));
  for (const payment of group.settlements.filter((item) => item.status === "SETTLED")) {
    changes.push({ id: `payment-${payment.id}`, text: `${payment.senderName} ${verb(payment.senderId, "has", "have")} already paid ${payment.recipientName} ${money(payment.amountCents)}; that payment is included in the current balances.` });
  }
  if (group.settlements.some((item) => item.status === "PENDING" || item.status === "CAPTURING")) {
    changes.push({ id: "unconfirmed", text: "Pending requests and payments still being processed do not reduce balances until confirmed." });
  }
  const balances = group.balances.map((balance) => ({
    id: `balance-${balance.memberId}`,
    text: `${balance.displayName}: paid ${money(balance.paidCents)} − own shares ${money(balance.shareCents)} + confirmed payments sent ${money(balance.settledSentCents)} − confirmed payments received ${money(balance.settledReceivedCents)}${balance.directionAdjustmentCents ? ` ${balance.directionAdjustmentCents > 0 ? "+" : "−"} direction corrections ${money(Math.abs(balance.directionAdjustmentCents))}` : ""} = ${balance.netCents > 0 ? `is owed ${money(balance.netCents)}` : balance.netCents < 0 ? `owes ${money(-balance.netCents)}` : "settled up"}.`,
  }));
  const transfers = group.repayments.map((payment, index) => ({ id: `transfer-${index}`, text: `${payment.fromName} ${verb(payment.fromMemberId, "pays", "pay")} ${payment.toName} ${money(payment.amountCents)}.` }));
  const shortcuts: RepaymentFact[] = [];
  // Trace direct expense obligations only when there are no historical corrections
  // or payments; otherwise the original paths would misrepresent remaining debts.
  if (!group.directionChanges.length && !group.settlements.some((item) => item.status === "SETTLED")) {
    const pending = edges.map((edge) => ({ ...edge }));
    for (const edge of pending) {
      const reverse = pending.find((item) => item.from === edge.to && item.to === edge.from && item.cents > 0);
      if (!reverse || edge.cents <= 0) continue;
      const offset = Math.min(edge.cents, reverse.cents);
      edge.cents -= offset;
      reverse.cents -= offset;
      shortcuts.push({ id: `offset-${shortcuts.length}`, text: `${name(edge.from)} and ${name(edge.to)} each owe the other ${money(offset)}, so those amounts cancel out.` });
    }
    for (const transfer of group.repayments) {
      let remainder = transfer.amountCents;
      while (remainder > 0) {
        const path = findPath(pending, transfer);
        if (!path) break;
        const amount = Math.min(remainder, ...path.map((edge) => edge.cents));
        if (path.length > 1) {
          const middle = path.slice(0, -1).map((edge) => name(edge.to));
          shortcuts.push({ id: `shortcut-${shortcuts.length}`, text: `${transfer.fromName} ${verb(transfer.fromMemberId, "pays", "pay")} ${transfer.toName} ${money(amount)} on behalf of ${middle.join(" and ")}, clearing a chain of debts.` });
        }
        for (const edge of path) edge.cents -= amount;
        remainder -= amount;
      }
    }
  }
  return { original, changes, balances, transfers, shortcuts };
}

function findPath(edges: Edge[], transfer: SuggestedRepayment): Edge[] | null {
  const queue: Array<{ id: string; path: Edge[] }> = [{ id: transfer.fromMemberId, path: [] }];
  const visited = new Set([transfer.fromMemberId]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const edge of edges) {
      if (edge.from !== current.id || edge.cents <= 0 || visited.has(edge.to)) continue;
      const path = [...current.path, edge];
      if (edge.to === transfer.toMemberId) return path;
      visited.add(edge.to);
      queue.push({ id: edge.to, path });
    }
  }
  return null;
}
