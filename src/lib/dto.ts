import type { Category, DesiredItem, Milestone, Purchase } from "@prisma/client";
import { round2 } from "./money";
import type { PlanItem, Priority } from "./planner";

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
