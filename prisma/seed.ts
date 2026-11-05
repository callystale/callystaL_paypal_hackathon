import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Priority = "LOW" | "MEDIUM" | "HIGH";

async function main() {
  // Delete group records before purchases: an ExpenseShare may point at a
  // personal-budget Purchase that was copied from the member's share.
  await prisma.repaymentDirectionChange.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.expenseShare.deleteMany();
  await prisma.groupExpense.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.order.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.desiredItem.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.category.deleteMany();

  await prisma.settings.create({
    data: {
      id: "singleton",
      salary: 6000,
      goals: "Keep rent covered, save for a trip, and spend less on takeout.",
    },
  });

  const groceries = await prisma.category.create({
    data: { name: "Groceries", budget: 600, color: "#22c55e" },
  });
  const dining = await prisma.category.create({
    data: { name: "Dining", budget: 250, color: "#f97316" },
  });
  const tech = await prisma.category.create({
    data: { name: "Tech", budget: 1200, color: "#6366f1" },
  });
  const transport = await prisma.category.create({
    data: { name: "Transport", budget: 180, color: "#06b6d4" },
  });

  const purchases: Array<{
    description: string;
    amount: number;
    merchant: string;
    categoryId: string;
    daysAgo: number;
  }> = [
    { description: "Weekly grocery run", amount: 143.2, merchant: "Whole Foods", categoryId: groceries.id, daysAgo: 2 },
    { description: "Produce + pantry restock", amount: 96.5, merchant: "Trader Joe's", categoryId: groceries.id, daysAgo: 7 },
    { description: "Weekend brunch", amount: 58.9, merchant: "The Local Diner", categoryId: dining.id, daysAgo: 3 },
    { description: "Coffee beans", amount: 21.75, merchant: "Blue Bottle", categoryId: dining.id, daysAgo: 5 },
    { description: "Monthly transit pass", amount: 78, merchant: "City Transit", categoryId: transport.id, daysAgo: 10 },
    { description: "Ride share to airport", amount: 42.3, merchant: "Uber", categoryId: transport.id, daysAgo: 12 },
    { description: "USB-C hub", amount: 64.99, merchant: "Amazon", categoryId: tech.id, daysAgo: 14 },
  ];

  for (const p of purchases) {
    const occurredAt = new Date();
    occurredAt.setDate(occurredAt.getDate() - p.daysAgo);
    await prisma.purchase.create({
      data: {
        description: p.description,
        amount: p.amount,
        merchant: p.merchant,
        categoryId: p.categoryId,
        occurredAt,
      },
    });
  }

  // --- Demo group: three members, two payers, and a one-cent remainder ------
  const daysAgo = (n: number) => {
    const date = new Date();
    date.setDate(date.getDate() - n);
    return date;
  };

  const trip = await prisma.group.create({
    data: {
      name: "Lake trip",
      currency: "USD",
      members: {
        create: [
          { displayName: "You", isSelf: true, paypalAddress: "you-demo" },
          { displayName: "Maya", paypalAddress: "maya-demo" },
          { displayName: "Leo", paypalAddress: "leo-demo" },
        ],
      },
    },
    include: { members: true },
  });
  const you = trip.members.find((member) => member.displayName === "You")!;
  const maya = trip.members.find((member) => member.displayName === "Maya")!;
  const leo = trip.members.find((member) => member.displayName === "Leo")!;

  // $300.00 / 3 = $100.00 each.
  await prisma.groupExpense.create({
    data: {
      groupId: trip.id,
      payerId: you.id,
      description: "Cabin rental",
      amountCents: 30000,
      category: "Travel",
      occurredAt: daysAgo(7),
      shares: {
        create: [
          { memberId: you.id, amountCents: 10000 },
          { memberId: maya.id, amountCents: 10000 },
          { memberId: leo.id, amountCents: 10000 },
        ],
      },
    },
  });

  // $86.47 / 3 = $28.82 with one leftover cent assigned to Maya. Shares still
  // add up to exactly $86.47 — never $86.469999… from floating point.
  const groceriesExpense = await prisma.groupExpense.create({
    data: {
      groupId: trip.id,
      payerId: maya.id,
      description: "Groceries for the cabin",
      amountCents: 8647,
      category: "Groceries",
      occurredAt: daysAgo(3),
      shares: {
        create: [
          { memberId: you.id, amountCents: 2882 },
          { memberId: maya.id, amountCents: 2883 },
          { memberId: leo.id, amountCents: 2882 },
        ],
      },
    },
    include: { shares: true },
  });

  // Show the optional bridge into the personal budget: only "You" gets a
  // purchase, for their own $28.82 share — not the whole $86.47 expense.
  const yourGroceriesShare = groceriesExpense.shares.find(
    (share) => share.memberId === you.id,
  )!;
  const sharedPurchase = await prisma.purchase.create({
    data: {
      description: "Shared: Groceries for the cabin",
      amount: 28.82,
      merchant: trip.name,
      categoryId: groceries.id,
      userCategorized: true,
      occurredAt: daysAgo(3),
    },
  });
  await prisma.expenseShare.update({
    where: { id: yourGroceriesShare.id },
    data: { purchaseId: sharedPurchase.id },
  });

  const plusDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  const items: Array<{
    name: string;
    targetPrice: number;
    priority: Priority;
    targetDate: Date;
    category: string;
    notes?: string;
  }> = [
    { name: "Mechanical keyboard", targetPrice: 160, priority: "HIGH", targetDate: plusDays(21), category: "Tech", notes: "75% layout, hot-swappable" },
    { name: "Noise-cancelling headphones", targetPrice: 299, priority: "HIGH", targetDate: plusDays(30), category: "Tech" },
    { name: "Standing desk", targetPrice: 450, priority: "MEDIUM", targetDate: plusDays(60), category: "Home Office" },
    { name: "Espresso machine", targetPrice: 320, priority: "MEDIUM", targetDate: plusDays(90), category: "Kitchen" },
    { name: "4K monitor", targetPrice: 380, priority: "LOW", targetDate: plusDays(120), category: "Tech" },
    { name: "Weighted blanket", targetPrice: 90, priority: "LOW", targetDate: plusDays(120), category: "Home" },
  ];

  for (const item of items) {
    await prisma.desiredItem.create({
      data: {
        name: item.name,
        targetPrice: item.targetPrice,
        priority: item.priority,
        targetDate: item.targetDate,
        category: item.category,
        notes: item.notes,
      },
    });
  }

  console.log(
    "Seeded settings, categories, purchases, desired items, and the Lake trip group.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
