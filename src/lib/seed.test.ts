import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

test("sample seed preserves user data and PayPal accounts and can run twice safely", async () => {
  const directory = mkdtempSync(join(tmpdir(), "notebook-seed-"));
  const database = join(directory, "test.db");
  writeFileSync(database, "");
  const env = { ...process.env, DATABASE_URL: `file:${database}`, SEED_DATE: "2026-11-08T05:00:00.000Z", TZ: "Asia/Ho_Chi_Minh" };
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env, stdio: "pipe" });
    const settings = await prisma.settings.create({ data: { salary: 3000, monthStartDay: 20, goals: "Keep my goals" } });
    const category = await prisma.category.create({ data: { name: "Groceries", budget: 300, color: "#123456" } });
    const purchase = await prisma.purchase.create({ data: { description: "My purchase", amount: 20, categoryId: category.id, occurredAt: new Date("2026-11-05") } });
    const group = await prisma.group.create({ data: { name: "My group", members: { create: [
      { displayName: "You", isSelf: true, paypalAddress: "you@test.example" },
      { displayName: "Mia", paypalAddress: "mia@test.example" },
      { displayName: "Nguyen", paypalAddress: "nguyen@test.example" },
    ] } }, include: { members: true } });
    const runSeed = () => execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], { env, stdio: "pipe" });
    runSeed();
    const snapshot = async () => ({ purchases: await prisma.purchase.findMany({ orderBy: { id: "asc" } }), items: await prisma.desiredItem.findMany({ orderBy: { id: "asc" } }), milestones: await prisma.milestone.findMany({ orderBy: { id: "asc" } }), groups: await prisma.group.findMany({ orderBy: { id: "asc" } }) });
    const first = await snapshot();
    runSeed();
    assert.deepEqual(await snapshot(), first);
    assert.deepEqual(await prisma.settings.findUnique({ where: { id: settings.id } }), settings);
    assert.deepEqual(await prisma.category.findUnique({ where: { id: category.id } }), category);
    assert.deepEqual(await prisma.purchase.findUnique({ where: { id: purchase.id } }), purchase);
    assert.equal(first.items.length, 6);
    assert.equal(first.milestones.length, 3);
    assert.equal(first.groups.length, 3);
    assert.ok(first.purchases.length > 30);
    assert.ok(first.purchases.every((p) => p.occurredAt <= new Date(env.SEED_DATE)));
    const seededMembers = await prisma.groupMember.findMany({ where: { groupId: { not: group.id } } });
    for (const member of seededMembers) {
      assert.equal(member.paypalAddress, group.members.find((m) => m.displayName === member.displayName)?.paypalAddress);
    }
    for (const expense of await prisma.groupExpense.findMany({ include: { shares: true } })) {
      assert.equal(expense.shares.reduce((sum, share) => sum + share.amountCents, 0), expense.amountCents);
    }
    assert.equal(await prisma.order.count(), 0);
    assert.equal(await prisma.settlement.count({ where: { paypalOrderId: { not: null } } }), 0);
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});
