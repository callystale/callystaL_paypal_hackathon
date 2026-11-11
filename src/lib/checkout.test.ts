import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("checkout pays individual, combined and remaining items without paying unselected items", async () => {
  const directory = mkdtempSync(join(tmpdir(), "planner-checkout-"));
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  writeFileSync(join(directory, "test.db"), "");
  process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
  const { prisma } = await import("./prisma");
  const { POST: create } = await import("../app/api/paypal/orders/route");
  const { POST: capture } = await import("../app/api/paypal/orders/[id]/capture/route");
  let sequence = 0;
  const request = (itemIds: string[]) => new Request("http://localhost/api/paypal/orders", {
    method: "POST", body: JSON.stringify({ itemIds }),
  });
  globalThis.fetch = async (url) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "token", expires_in: 300 });
    if (String(url).endsWith("/capture")) return Response.json({ id: "capture", status: "COMPLETED" });
    return Response.json({ id: `order-${++sequence}`, status: "CREATED" });
  };
  try {
    const first = await prisma.milestone.create({ data: { title: "First" } });
    const second = await prisma.milestone.create({ data: { title: "Second" } });
    for (const [id, price, milestoneId] of [["a", 10, first.id], ["b", 20, first.id], ["c", 30, second.id], ["d", 40, second.id]] as const) {
      await prisma.desiredItem.create({ data: { id, name: id, targetPrice: price, milestoneId } });
    }
    assert.equal((await create(request([]))).status, 422);
    assert.equal((await create(request(["missing"]))).status, 404);
    const duplicate = await (await create(request(["a"]))).json();
    const single = await (await create(request(["a", "a"]))).json();
    assert.equal(single.amount, 10);
    // Price changes after approval must not change recorded spending.
    await prisma.desiredItem.update({ where: { id: "a" }, data: { targetPrice: 99 } });
    await capture(new Request("http://localhost"), { params: { id: single.orderId } });
    await capture(new Request("http://localhost"), { params: { id: single.orderId } });
    assert.equal((await capture(new Request("http://localhost"), { params: { id: duplicate.orderId } })).status, 409);
    assert.equal(await prisma.purchase.count(), 1);
    assert.equal((await prisma.purchase.findFirst())?.amount, 10);
    assert.equal((await prisma.desiredItem.findUnique({ where: { id: "b" } }))?.purchased, false);
    assert.equal((await prisma.milestone.findUnique({ where: { id: first.id } }))?.status, "PLANNED");
    assert.equal((await create(request(["a"]))).status, 409);
    const combined = await (await create(request(["b", "c"]))).json();
    assert.equal(combined.amount, 50);
    await capture(new Request("http://localhost"), { params: { id: combined.orderId } });
    assert.equal((await prisma.milestone.findUnique({ where: { id: first.id } }))?.status, "COMPLETED");
    assert.equal((await prisma.milestone.findUnique({ where: { id: second.id } }))?.status, "PLANNED");
    assert.equal((await prisma.desiredItem.findUnique({ where: { id: "d" } }))?.purchased, false);
    const remaining = await (await create(request(["d"]))).json();
    await capture(new Request("http://localhost"), { params: { id: remaining.orderId } });
    assert.equal(await prisma.desiredItem.count({ where: { purchased: false } }), 0);
    assert.equal(await prisma.purchase.count(), 4);
    assert.equal((await prisma.milestone.findUnique({ where: { id: second.id } }))?.status, "COMPLETED");

    // A processing payment must not prevent sharing an unpaid QR request.
    const { POST: requestSettlement } = await import("../app/api/groups/[id]/settlements/route");
    const group = await prisma.group.create({ data: { name: "QR regression", currency: "USD" } });
    const sender = await prisma.groupMember.create({ data: { groupId: group.id, displayName: "Sender" } });
    const recipient = await prisma.groupMember.create({ data: { groupId: group.id, displayName: "Recipient" } });
    await prisma.groupExpense.create({ data: {
      groupId: group.id, payerId: recipient.id, description: "Shared dinner", amountCents: 2000,
      shares: { create: [{ memberId: sender.id, amountCents: 1000 }, { memberId: recipient.id, amountCents: 1000 }] },
    } });
    await prisma.settlement.create({ data: {
      groupId: group.id, senderId: sender.id, recipientId: recipient.id,
      amountCents: 100, status: "CAPTURING", paypalOrderId: "processing-order",
    } });
    const settlementRequest = (status: string) => new Request("http://localhost/api/groups/settlements", {
      method: "POST", body: JSON.stringify({ senderId: sender.id, recipientId: recipient.id, amountCents: 1000, status }),
    });
    const qr = await requestSettlement(settlementRequest("PENDING"), { params: { id: group.id } });
    assert.equal(qr.status, 201);
    const qrBody = await qr.json();
    assert.equal(qrBody.group.repayments[0].amountCents, 1000);
    const again = await requestSettlement(settlementRequest("PENDING"), { params: { id: group.id } });
    assert.equal((await again.json()).settlementId, qrBody.settlementId);
    const manual = await requestSettlement(settlementRequest("SETTLED"), { params: { id: group.id } });
    assert.equal(manual.status, 409);
    assert.match((await manual.json()).error, /payment is being processed/);

    const { POST: captureSettlement } = await import("../app/api/groups/[id]/settlements/[settlementId]/capture/route");
    await prisma.groupMember.update({ where: { id: sender.id }, data: { paypalAddress: "sender@example.com" } });
    await prisma.groupMember.update({ where: { id: recipient.id }, data: { paypalAddress: "recipient@example.com" } });
    await prisma.settlement.update({ where: { id: qrBody.settlementId }, data: { paypalOrderId: "overlap-order" } });
    // The full debt is unavailable while part of the same debt is in flight.
    const overlap = await captureSettlement(new Request("http://localhost"), { params: { id: group.id, settlementId: qrBody.settlementId } });
    assert.equal(overlap.status, 409);
    assert.match((await overlap.json()).error, /already processing this debt/);

    const independent = await prisma.groupMember.create({ data: {
      groupId: group.id, displayName: "Independent", paypalAddress: "independent@example.com",
    } });
    await prisma.groupExpense.create({ data: {
      groupId: group.id, payerId: recipient.id, description: "Another dinner", amountCents: 500,
      shares: { create: [{ memberId: independent.id, amountCents: 500 }] },
    } });
    const payment = await prisma.settlement.create({ data: {
      groupId: group.id, senderId: independent.id, recipientId: recipient.id,
      amountCents: 500, status: "PENDING", paypalOrderId: "independent-order",
    } });
    let captures = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes("oauth2")) return Response.json({ access_token: "token", expires_in: 300 });
      if (options?.method === "POST") {
        captures++;
        return Response.json({ id: "independent-order", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "confirmed-capture", status: "COMPLETED" }] } }] });
      }
      return Response.json({ id: "independent-order", status: "APPROVED", payer: { email_address: "independent@example.com" },
        purchase_units: [{ payee: { email_address: "recipient@example.com" }, amount: { currency_code: "USD", value: "5.00" } }] });
    };
    const captureParams = { params: { id: group.id, settlementId: payment.id } };
    const confirmed = await captureSettlement(new Request("http://localhost"), captureParams);
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).status, "SETTLED");
    assert.equal((await prisma.settlement.findUnique({ where: { id: payment.id } }))?.paymentReference, "confirmed-capture");
    await captureSettlement(new Request("http://localhost"), captureParams);
    assert.equal(captures, 1);

    const { POST: addMilestone } = await import("../app/api/milestones/route");
    const { DELETE: deleteMilestone } = await import("../app/api/milestones/[id]/route");
    const { PATCH: moveItem } = await import("../app/api/items/[id]/route");
    const manualStage = await addMilestone(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "My next purchases" }) }));
    assert.equal(manualStage.status, 201);
    const stage = await manualStage.json();
    assert.equal(stage.items.length, 0);
    await prisma.desiredItem.create({ data: { id: "movable", name: "Desk", targetPrice: 50, milestoneId: first.id } });
    const move = (milestoneId: string | null) => moveItem(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ milestoneId }) }), { params: { id: "movable" } });
    assert.equal((await move(stage.id)).status, 200);
    assert.equal((await prisma.desiredItem.findUnique({ where: { id: "movable" } }))?.milestoneId, stage.id);
    assert.equal((await move("missing-stage")).status, 404);
    assert.equal((await move(null)).status, 200);
    assert.equal((await move(stage.id)).status, 200);
    await deleteMilestone(new Request("http://localhost"), { params: { id: stage.id } });
    const kept = await prisma.desiredItem.findUnique({ where: { id: "movable" } });
    assert.equal(kept?.name, "Desk");
    assert.equal(kept?.milestoneId, null);
    assert.equal(await prisma.purchase.count(), 4);
    assert.equal((await prisma.desiredItem.findUnique({ where: { id: "a" } }))?.purchased, true);
  } finally {
    await prisma.$disconnect();
    globalThis.fetch = originalFetch;
    process.env = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
