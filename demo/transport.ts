import snapshot from "./snapshot.json";
import savedWhatIf from "./whatif.json";
import type { WhatIfResponse } from "../src/lib/whatif";
import { api, type CategoryDTO, type GroupDetailDTO, type ItemDTO, type PurchaseDTO, type SettingsDTO } from "../src/lib/client";
import { computeBalances, repaymentPlan, splitEqually, toCents, validateRepayment } from "../src/lib/group";
import { repaymentExplanation } from "../src/lib/repayment-explanation";
import { periodBounds } from "../src/lib/period";

let settings = structuredClone(snapshot.settings) as SettingsDTO;
let categories = structuredClone(snapshot.summary.categories) as CategoryDTO[];
let purchases = structuredClone(snapshot.purchases) as PurchaseDTO[];
let items = structuredClone(snapshot.items) as ItemDTO[];
let groups = structuredClone(snapshot.groups) as GroupDetailDTO[];
let milestones = structuredClone(snapshot.plan.milestones);
// The exported plan is authoritative; its IDs may differ from item snapshots.
items.forEach(item => { item.milestoneId = milestones.find(m => m.items.some(original => original.id === item.id))?.id ?? null; });
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const round = (value: number) => Math.round(value * 100) / 100;
function refreshGroup(group: GroupDetailDTO) {
  group.expenses.forEach(expense => { expense.payerName = group.members.find(member => member.id === expense.payerId)?.displayName ?? "Member"; expense.shares.forEach(share => { const member = group.members.find(m => m.id === share.memberId); share.memberName = member?.displayName ?? "Member"; share.isSelf = member?.isSelf ?? false; }); });
  group.balances = computeBalances(group.members, group.expenses, group.settlements, group.directionChanges);
  group.repayments = repaymentPlan(group.members, group.expenses, group.settlements, group.directionChanges);
  group.totals = { spentCents: group.expenses.reduce((sum, expense) => sum + expense.amountCents, 0), yourNetCents: group.balances.find(member => member.isSelf)?.netCents ?? null };
  return group;
}
// Everything stays in memory. This adapter is bundled only into the static demo.
async function request(method: string, raw: string, body: any = {}): Promise<any> {
  const url = new URL(raw, "https://demo.invalid");
  const path = url.pathname;
  if (path.includes("paypal") || path.includes("payment-link")) throw new Error("Demo mode: PayPal transactions and payment links are disabled. Run the full app to test Sandbox checkout.");
  if (path === "/api/status") return { ollama: { configured: true, model: `${snapshot.model} · preloaded demo`, baseUrl: "" }, channel3: { configured: false }, paypal: { configured: false, clientId: "", env: "sandbox", currency: "USD" } };
  if (path === "/api/settings") { if (method !== "GET") settings = { ...settings, ...body }; return settings; }
  if (path === "/api/summary") {
    const offset = Number(url.searchParams.get("offset") || 0);
    const { start, end } = periodBounds(new Date(), settings.monthStartDay, offset);
    const periodPurchases = purchases.filter(purchase => new Date(purchase.occurredAt) >= start && new Date(purchase.occurredAt) < end);
    const current = categories.map(category => { const relevant = periodPurchases.filter(p => p.categoryId === category.id); const spent = round(relevant.reduce((sum, p) => sum + p.amount, 0)); return { ...category, spent, remaining: category.budget === null ? null : round(category.budget - spent), purchaseCount: relevant.length }; });
    const budget = round(current.reduce((sum, c) => sum + (c.budget ?? 0), 0)); const spent = round(periodPurchases.reduce((sum, p) => sum + p.amount, 0));
    return { currency: "USD", periodStart: start.toISOString(), periodEnd: end.toISOString(), offset, monthStartDay: settings.monthStartDay, categories: current, totals: { budget, spent, remaining: round(budget - spent), allTimeSpent: round(purchases.reduce((sum, p) => sum + p.amount, 0)) }, items: { total: items.length, purchased: items.filter(item => item.purchased).length } };
  }
  if (path === "/api/budget" && method === "PUT") { settings = { ...settings, salary: body.salary, goals: body.goals }; categories = body.categories.map((c: CategoryDTO) => ({ ...c, id: c.id || uid(), spent: 0, remaining: c.budget, purchaseCount: 0 })); return settings; }
  if (path === "/api/budget/questions") return snapshot.questions;
  if (path === "/api/budget/suggest") return snapshot.suggestion;
  if (path.startsWith("/api/categories/")) { const id = path.split("/")[3]; if (method === "DELETE") { categories = categories.filter(c => c.id !== id); purchases.forEach(p => { if (p.categoryId === id) { p.categoryId = null; p.categoryName = null; } }); } else categories = categories.map(c => c.id === id ? { ...c, ...body } : c); return {}; }
  if (path === "/api/purchases" || path.startsWith("/api/purchases/")) {
    const id = path.split("/")[3];
    if (method === "GET") return purchases;
    if (method === "DELETE") purchases = purchases.filter(p => p.id !== id);
    else if (method === "POST") purchases.unshift({ id: uid(), description: body.description, amount: round(body.amount), merchant: body.merchant ?? null, categoryId: body.categoryId ?? null, categoryName: categories.find(c => c.id === body.categoryId)?.name ?? null, userCategorized: true, aiConfidence: null, occurredAt: now() });
    else purchases = purchases.map(p => p.id === id ? { ...p, ...body, categoryName: categories.find(c => c.id === (body.categoryId ?? p.categoryId))?.name ?? null } : p);
    return {};
  }
  if (path === "/api/items" || path.startsWith("/api/items/")) {
    if (body.milestoneId && !milestones.some(m => m.id === body.milestoneId)) throw new Error("Milestone not found");
    const id = path.split("/")[3]; if (method === "GET") return items;
    if (method === "DELETE") items = items.filter(item => item.id !== id);
    else if (method === "POST") items.push({ id: uid(), name: body.name, notes: body.notes ?? null, targetPrice: body.targetPrice, priority: body.priority ?? "MEDIUM", targetDate: body.targetDate ?? null, category: body.category ?? null, url: body.url ?? null, purchased: false, alternativeName: null, alternativePrice: null, alternativeUrl: null, milestoneId: null, effectivePrice: body.targetPrice });
    else items = items.map(item => { if (item.id !== id) return item; const updated = { ...item, ...body }; if ("alternative" in body) { updated.alternativeName = body.alternative?.name ?? null; updated.alternativePrice = body.alternative?.price ?? null; updated.alternativeUrl = body.alternative?.url ?? null; } updated.effectivePrice = updated.alternativePrice ?? updated.targetPrice; return updated; });
    return {};
  }
  if (path === "/api/plan") {
    if (method === "DELETE") { milestones = []; items.forEach(item => { item.milestoneId = null; }); }
    if (method === "POST") {
      milestones = structuredClone(snapshot.plan.milestones);
      items.forEach(item => { item.milestoneId = item.purchased ? null : milestones.find(m => m.items.some(original => original.id === item.id))?.id ?? null; });
    }
    return { ...snapshot.plan, milestones: milestones.map(m => {
      const currentItems = items.filter(item => item.milestoneId === m.id);
      return { ...m, items: currentItems, status: currentItems.length && currentItems.every(item => item.purchased) ? "COMPLETED" : "PLANNED", total: round(currentItems.reduce((sum, item) => sum + item.effectivePrice, 0)) };
    }) };
  }
  if (path === "/api/milestones" && method === "POST") {
    const title = String(body.title ?? "").trim();
    if (!title || title.length > 80) throw new Error("Enter a milestone name of up to 80 characters");
    const milestone = { id: uid(), title, rationale: "", sequence: milestones.length + 1, status: "PLANNED", items: [], total: 0 };
    milestones.push(milestone);
    return milestone;
  }
  if (path.startsWith("/api/milestones/")) {
    const id = path.split("/")[3];
    const milestone = milestones.find(m => m.id === id);
    if (!milestone) throw new Error("Milestone not found");
    if (method === "DELETE") {
      milestones = milestones.filter(m => m.id !== id);
      milestones.forEach((m, index) => { m.sequence = index + 1; });
      items.forEach(item => { if (item.milestoneId === id) item.milestoneId = null; });
    } else if (method === "PATCH") milestone.title = body.title;
    return {};
  }
  if (path === "/api/what-if") {
    const saved = (savedWhatIf as Record<string, WhatIfResponse>)[body.itemId];
    if (!saved) throw new Error("No pre-recorded assessment exists for this item. Select an original sample wishlist item, or run the full app for live AI.");
    return saved;
  }
  if (path === "/api/alternatives") return { source: "fallback", alternatives: [] };
  if (path === "/api/groups") {
    if (method === "POST") { const group: GroupDetailDTO = { id: uid(), name: body.name, currency: body.currency ?? "USD", createdAt: now(), members: [{ id: uid(), displayName: body.yourName || "You", isSelf: true, paypalAddress: body.yourPaypalAddress || null, createdAt: now() }, ...(body.friends || []).map((friend: any) => ({ ...friend, id: uid(), isSelf: false, createdAt: now() }))], expenses: [], settlements: [], balances: [], repayments: [], directionChanges: [], totals: { spentCents: 0, yourNetCents: 0 } }; groups.push(group); return refreshGroup(group); }
    return groups.map(g => ({ id: g.id, name: g.name, currency: g.currency, createdAt: g.createdAt, memberCount: g.members.length, expenseCount: g.expenses.length, selfMemberId: g.members.find(m => m.isSelf)?.id ?? null, selfName: g.members.find(m => m.isSelf)?.displayName ?? null }));
  }
  if (path.startsWith("/api/groups/")) {
    const [, , , id, collection, child, operation] = path.split("/");
    const group = groups.find(g => g.id === id); if (!group) throw new Error("Sample group not found.");
    if (!collection) { if (method === "DELETE") groups = groups.filter(g => g.id !== id); else if (method !== "GET") Object.assign(group, body); return refreshGroup(group); }
    if (collection === "explain") { const facts = repaymentExplanation(refreshGroup(group)); return { source: "calculated", facts: [...facts.original, ...facts.changes, ...facts.balances, ...facts.shortcuts] }; }
    if (collection === "members") {
      if (method === "POST") group.members.push({ id: uid(), displayName: body.displayName || body.paypalAddress.split("@")[0], isSelf: false, paypalAddress: body.paypalAddress || null, createdAt: now() });
      else if (method === "DELETE") { if (group.expenses.length) throw new Error("Reset this demo group before removing members with expenses."); group.members = group.members.filter(m => m.id !== child); }
      else group.members.forEach(member => { if (member.id === child) Object.assign(member, body); });
    } else if (collection === "expenses") {
      if (operation) throw new Error("Copying group shares to your budget is available in the full app. This demo keeps personal and group sample ledgers separate.");
      if (method === "DELETE") group.expenses = group.expenses.filter(e => e.id !== child);
      else {
        const old = group.expenses.find(e => e.id === child); const cents = toCents(body.amount ?? (old ? old.amountCents / 100 : 0));
        const payerId = body.payerId ?? old?.payerId;
        const participants = body.participantIds ?? old?.shares.map(s => s.memberId) ?? group.members.map(m => m.id);
        if (cents <= 0 || !group.members.some(m => m.id === payerId) || participants.some((memberId: string) => !group.members.some(m => m.id === memberId))) throw new Error("Choose valid participants, payer, and amount.");
        const expense = { id: old?.id ?? uid(), description: body.description ?? old?.description, amountCents: cents, payerId, payerName: "", category: body.category ?? null, occurredAt: body.occurredAt || now(), shares: splitEqually(cents, participants).map(s => ({ ...s, id: uid(), memberName: "", isSelf: false, purchaseId: null })) };
        group.expenses = [...group.expenses.filter(e => e.id !== expense.id), expense]; refreshGroup(group); return { expense, group };
      }
    } else if (collection === "settlements") {
      if (method === "DELETE") group.settlements = group.settlements.filter(s => s.id !== child);
      else if (method === "PATCH") group.settlements.forEach(s => { if (s.id === child) Object.assign(s, body); });
      else { const error = validateRepayment(refreshGroup(group).repayments, body.senderId, body.recipientId, body.amountCents); if (error) throw new Error(error); group.settlements.push({ id: uid(), senderId: body.senderId, recipientId: body.recipientId, senderName: group.members.find(m => m.id === body.senderId)?.displayName ?? "", recipientName: group.members.find(m => m.id === body.recipientId)?.displayName ?? "", amountCents: body.amountCents, status: body.status ?? "SETTLED", paypalOrderId: null, paymentReference: "demo only", note: "Demo settlement; no money moved.", settledAt: now(), createdAt: now() }); }
    } else if (collection === "repayments" && child === "reverse") group.directionChanges.push({ id: uid(), fromMemberId: body.fromMemberId, toMemberId: body.toMemberId, amountCents: body.amountCents, fromName: body.fromName, toName: body.toName, createdAt: now() });
    else throw new Error("This action needs the full app. No changes were made.");
    return { group: refreshGroup(group) };
  }
  throw new Error("This feature needs live AI in the full app. The static demo provides saved budget suggestions and purchase milestones only.");
}
export function installDemoTransport() {
  Object.assign(api, Object.fromEntries(["get", "post", "patch", "put", "delete"].map(method => [method, async (url: string, body?: unknown) => structuredClone(await request(method.toUpperCase(), url, body))])));
}
