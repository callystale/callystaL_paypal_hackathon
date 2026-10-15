import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Priority = "LOW" | "MEDIUM" | "HIGH";

async function main() {
  await prisma.order.deleteMany();
  await prisma.desiredItem.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.category.deleteMany();

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

  console.log("Seeded categories, purchases, and desired items.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
