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
  } finally {
    await prisma.$disconnect();
    globalThis.fetch = originalFetch;
    process.env = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
