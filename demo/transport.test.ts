import { test } from "node:test";
import assert from "node:assert/strict";
import { installDemoTransport } from "./transport";
import { api, type GroupDetailDTO, type GroupSummaryDTO, type PlanResponse, type PurchaseDTO, type SummaryDTO } from "../src/lib/client";

installDemoTransport();
globalThis.fetch = async () => { throw new Error("Static demo must never call a network API"); };

test("actual dashboard endpoints load and sample purchase changes the current budget", async () => {
  const before = await api.get<SummaryDTO>("/api/summary");
  assert(before.categories.length > 0);
  await api.post("/api/purchases", { description: "Demo verification", amount: 12.34, categoryId: before.categories[0].id });
  const after = await api.get<SummaryDTO>("/api/summary");
  assert.equal(Math.round((after.totals.spent - before.totals.spent) * 100), 1234);
  const purchases = await api.get<PurchaseDTO[]>("/api/purchases");
  const added = purchases.find(p => p.description === "Demo verification")!;
  await api.delete(`/api/purchases/${added.id}`);
  assert.equal((await api.get<SummaryDTO>("/api/summary")).totals.spent, before.totals.spent);
  const plan = await api.get<PlanResponse>("/api/plan");
  assert.equal(plan.source, "ollama");
  assert(plan.milestones.every(m => m.items.length > 0));
});

test("actual group panel endpoints split cents and apply manual demo repayments", async () => {
  const list = await api.get<GroupSummaryDTO[]>("/api/groups");
  const url = `/api/groups/${list[0].id}`;
  const group = await api.get<GroupDetailDTO>(url);
  const result = await api.post<{group: GroupDetailDTO}>(`${url}/expenses`, { description: "Cent remainder", amount: 10.01, payerId: group.members[0].id, participantIds: group.members.map(m => m.id) });
  const expense = result.group.expenses.find(e => e.description === "Cent remainder")!;
  assert.equal(expense.shares.reduce((sum, share) => sum + share.amountCents, 0), 1001);
  assert.equal(result.group.balances.reduce((sum, member) => sum + member.netCents, 0), 0);
  const repayment = result.group.repayments[0];
  const settled = await api.post<{group: GroupDetailDTO}>(`${url}/settlements`, { senderId: repayment.fromMemberId, recipientId: repayment.toMemberId, amountCents: repayment.amountCents, status: "SETTLED" });
  assert.equal(settled.group.balances.reduce((sum, member) => sum + member.netCents, 0), 0);
  assert(!settled.group.repayments.some(r => r.fromMemberId === repayment.fromMemberId && r.toMemberId === repayment.toMemberId));
  await assert.rejects(() => api.post("/api/paypal/orders", {}), /disabled/);
});

test("buy-now assessments replay genuine saved AI output and reject uncaptured items", async () => {
  const items = await api.get<Array<{id: string}>>("/api/items");
  for (const item of items) {
    const result = await api.post<import("../src/lib/whatif").WhatIfResponse>("/api/what-if", { itemId: item.id });
    assert.equal(result.assessment.source, "ollama");
    assert.equal(result.context.item.id, item.id);
    assert.equal(result.preRecorded?.model, "llama3.2:3b");
    assert(result.assessment.summary.length > 0);
  }
  await assert.rejects(() => api.post("/api/what-if", { itemId: "uncaptured" }), /No pre-recorded assessment/);
});

test("manual milestones support moving items and preserve wishlist on deletion", async () => {
  const items = await api.get<Array<{ id: string }>>("/api/items");
  const stage = await api.post<{ id: string }>("/api/milestones", { title: "My own stage" });
  await api.patch(`/api/items/${items[0].id}`, { milestoneId: stage.id });
  const plan = await api.get<{ milestones: Array<{ id: string; items: Array<{ id: string }> }> }>("/api/plan");
  assert.equal(plan.milestones.find(m => m.id === stage.id)?.items[0].id, items[0].id);
  assert.equal(plan.milestones.flatMap(m => m.items).filter(i => i.id === items[0].id).length, 1);
  await api.delete(`/api/milestones/${stage.id}`);
  const kept = await api.get<Array<{ id: string; milestoneId: string | null }>>("/api/items");
  assert.equal(kept.find(i => i.id === items[0].id)?.milestoneId, null);
});
