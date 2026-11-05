import type { Category, DesiredItem, Milestone, Prisma, Purchase } from "@prisma/client";
import { round2 } from "./money";
import type { PlanItem, Priority } from "./planner";
import {
  computeBalances,
  suggestRepayments,
  type GroupDetailDTO,
  type GroupSummaryDTO,
} from "./group";

export interface CategoryDTO {
  id: string;
  name: string;
  color: string;
  budget: number | null;
  spent: number;
  remaining: number | null;
  purchaseCount: number;
}

export interface PurchaseDTO {
  id: string;
  description: string;
  amount: number;
  merchant: string | null;
  categoryId: string | null;
  categoryName: string | null;
  userCategorized: boolean;
  aiConfidence: number | null;
  occurredAt: string;
}

export interface ItemDTO {
  id: string;
  name: string;
  notes: string | null;
  targetPrice: number;
  priority: Priority;
  targetDate: string | null;
  url: string | null;
  category: string | null;
  purchased: boolean;
  alternativeName: string | null;
  alternativePrice: number | null;
  alternativeUrl: string | null;
  milestoneId: string | null;
  effectivePrice: number;
}

export interface MilestoneDTO {
  id: string;
  title: string;
  rationale: string | null;
  sequence: number;
  status: string;
  total: number;
  items: ItemDTO[];
}

export function toCategoryDTO(category: Category, purchases: Purchase[]): CategoryDTO {
  const relevant = purchases.filter((p) => p.categoryId === category.id);
  const spent = round2(relevant.reduce((sum, p) => sum + p.amount, 0));
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    budget: category.budget,
    spent,
    remaining: category.budget == null ? null : round2(category.budget - spent),
    purchaseCount: relevant.length,
  };
}

export function toPurchaseDTO(purchase: Purchase & { category?: Category | null }): PurchaseDTO {
  return {
    id: purchase.id,
    description: purchase.description,
    amount: purchase.amount,
    merchant: purchase.merchant,
    categoryId: purchase.categoryId,
    categoryName: purchase.category?.name ?? null,
    userCategorized: purchase.userCategorized,
    aiConfidence: purchase.aiConfidence,
    occurredAt: purchase.occurredAt.toISOString(),
  };
}

export function itemEffectivePrice(item: DesiredItem): number {
  return round2(item.alternativePrice ?? item.targetPrice);
}

export function toItemDTO(item: DesiredItem): ItemDTO {
  return {
    id: item.id,
    name: item.name,
    notes: item.notes,
    targetPrice: item.targetPrice,
    priority: item.priority as Priority,
    targetDate: item.targetDate ? item.targetDate.toISOString() : null,
    url: item.url,
    category: item.category,
    purchased: item.purchased,
    alternativeName: item.alternativeName,
    alternativePrice: item.alternativePrice,
    alternativeUrl: item.alternativeUrl,
    milestoneId: item.milestoneId,
    effectivePrice: itemEffectivePrice(item),
  };
}

export function toMilestoneDTO(milestone: Milestone & { items: DesiredItem[] }): MilestoneDTO {
  const items = [...milestone.items].sort((a, b) => b.targetPrice - a.targetPrice);
  return {
    id: milestone.id,
    title: milestone.title,
    rationale: milestone.rationale,
    sequence: milestone.sequence,
    status: milestone.status,
    total: round2(items.reduce((sum, i) => sum + itemEffectivePrice(i), 0)),
    items: items.map(toItemDTO),
  };
}

export type GroupSummaryPayload = Prisma.GroupGetPayload<{
  include: {
    members: { select: { id: true; displayName: true; isSelf: true } };
    _count: { select: { members: true; expenses: true } };
  };
}>;

export type GroupDetailPayload = Prisma.GroupGetPayload<{
  include: {
    members: true;
    expenses: {
      include: {
        payer: true;
        shares: { include: { member: true } };
      };
    };
    settlements: { include: { sender: true; recipient: true } };
    directionChanges: { include: { fromMember: true; toMember: true } };
  };
}>;

export function toGroupSummaryDTO(group: GroupSummaryPayload): GroupSummaryDTO {
  const self = group.members.find((member) => member.isSelf) ?? null;
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    createdAt: group.createdAt.toISOString(),
    memberCount: group._count.members,
    expenseCount: group._count.expenses,
    selfMemberId: self?.id ?? null,
    selfName: self?.displayName ?? null,
  };
}

export function toGroupDetailDTO(group: GroupDetailPayload): GroupDetailDTO {
  const members = group.members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    isSelf: member.isSelf,
    paypalAddress: member.paypalAddress,
    createdAt: member.createdAt.toISOString(),
  }));

  const expenses = [...group.expenses]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .map((expense) => ({
      id: expense.id,
      description: expense.description,
      amountCents: expense.amountCents,
      category: expense.category,
      occurredAt: expense.occurredAt.toISOString(),
      payerId: expense.payerId,
      payerName: expense.payer.displayName,
      shares: [...expense.shares]
        .sort((a, b) => a.member.displayName.localeCompare(b.member.displayName))
        .map((share) => ({
          id: share.id,
          memberId: share.memberId,
          memberName: share.member.displayName,
          isSelf: share.member.isSelf,
          amountCents: share.amountCents,
          purchaseId: share.purchaseId,
        })),
    }));

  const settlements = [...group.settlements]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((settlement) => ({
      id: settlement.id,
      senderId: settlement.senderId,
      senderName: settlement.sender.displayName,
      recipientId: settlement.recipientId,
      recipientName: settlement.recipient.displayName,
      amountCents: settlement.amountCents,
      status: settlement.status,
      paypalOrderId: settlement.paypalOrderId,
      paymentReference: settlement.paymentReference,
      note: settlement.note,
      settledAt: settlement.settledAt ? settlement.settledAt.toISOString() : null,
      createdAt: settlement.createdAt.toISOString(),
    }));

  const directionChanges = [...group.directionChanges]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((change) => ({
      id: change.id,
      fromMemberId: change.fromMemberId,
      fromName: change.fromMember.displayName,
      toMemberId: change.toMemberId,
      toName: change.toMember.displayName,
      amountCents: change.amountCents,
      createdAt: change.createdAt.toISOString(),
    }));

  const balances = computeBalances(
    members,
    group.expenses.map((expense) => ({
      payerId: expense.payerId,
      amountCents: expense.amountCents,
      shares: expense.shares.map((share) => ({
        memberId: share.memberId,
        amountCents: share.amountCents,
      })),
    })),
    group.settlements.map((settlement) => ({
      senderId: settlement.senderId,
      recipientId: settlement.recipientId,
      amountCents: settlement.amountCents,
      status: settlement.status,
    })),
    directionChanges,
  );

  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    createdAt: group.createdAt.toISOString(),
    members,
    expenses,
    settlements,
    balances,
    repayments: suggestRepayments(balances),
    directionChanges,
    totals: {
      spentCents: expenses.reduce((sum, expense) => sum + expense.amountCents, 0),
      yourNetCents: balances.find((balance) => balance.isSelf)?.netCents ?? null,
    },
  };
}

export function toPlanItem(item: DesiredItem): PlanItem {
  return {
    id: item.id,
    name: item.name,
    targetPrice: item.targetPrice,
    priority: item.priority as Priority,
    targetDate: item.targetDate ? item.targetDate.toISOString() : null,
    category: item.category,
    notes: item.notes,
  };
}
