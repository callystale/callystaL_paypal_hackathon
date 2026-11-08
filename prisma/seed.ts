import { PrismaClient } from "@prisma/client";
import { addDays, periodBounds } from "../src/lib/period";
import { round2 } from "../src/lib/money";

// Stable IDs make repeated seeds additive and safe: existing rows are never reset.
const prisma = new PrismaClient();
const prefix = "notebook-demo-";
process.env.TZ = "Asia/Ho_Chi_Minh";

async function main() {
  const now = process.env.SEED_DATE ? new Date(process.env.SEED_DATE) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid SEED_DATE");
  // Prefer the accounts already used in the app. These defaults are the same
  // sandbox identities; seeding never contacts PayPal or creates a payment.
  const savedMembers = await prisma.groupMember.findMany({ orderBy: { createdAt: "asc" } });
  const accounts = [
    { name: "You", isSelf: true, email: savedMembers.find((m) => m.isSelf && m.paypalAddress)?.paypalAddress ?? "sb-w3wwk53694373@personal.example.com" },
    { name: "Mia", isSelf: false, email: savedMembers.find((m) => m.displayName.toLowerCase() === "mia" && m.paypalAddress)?.paypalAddress ?? "sb-yxwlf53694377@personal.example.com" },
    { name: "Nguyen", isSelf: false, email: savedMembers.find((m) => m.displayName.toLowerCase() === "nguyen" && m.paypalAddress)?.paypalAddress ?? "sb-w2j0p53694380@personal.example.com" },
  ];

  await prisma.$transaction(async (tx) => {
    const settings = await tx.settings.upsert({
      where: { id: "singleton" }, update: {},
      create: { id: "singleton", salary: 3000, monthStartDay: 20, goals: "Cover the essentials, build an emergency fund, and make room for a Japan trip with Mia and Nguyen." },
    });
    const definitions = [
      { name: "Rent", budget: 900, color: "#9e927e" },
      { name: "Groceries", budget: 300, color: "#829877" },
      { name: "Dining", budget: 150, color: "#c69c80" },
      { name: "Transport", budget: 100, color: "#8daab1" },
      { name: "Daily", budget: 250, color: "#bf919e" },
      { name: "Tech", budget: 120, color: "#a59aba" },
      { name: "Saving", budget: 600, color: "#6f9382" },
      { name: "Tithe", budget: 300, color: "#c3b270" },
      { name: "Travel", budget: 280, color: "#899cad" },
    ];
    const categories = new Map<string, { id: string; budget: number | null }>();
    for (const category of definitions) {
      categories.set(category.name, await tx.category.upsert({ where: { name: category.name }, update: {}, create: category }));
    }

    // Relative dates follow the user's payday period, including at month boundaries.
    const patterns: Array<{ category: string; fraction: number; entries: Array<[string, string, number]> }> = [
      { category: "Rent", fraction: 1, entries: [["Monthly apartment rent", "Apartment management", 1]] },
      { category: "Groceries", fraction: .58, entries: [["Weekly groceries and fresh produce", "Co.opmart", .34], ["Pantry staples and breakfast supplies", "WinMart", .28], ["Fruit and vegetables", "Neighborhood market", .22], ["Milk, eggs and household essentials", "Co.op Food", .16]] },
      { category: "Dining", fraction: .72, entries: [["Friday dinner with friends", "Pizza 4P's", .42], ["Morning coffee and a pastry", "The Coffee House", .14], ["Lunch between meetings", "Pho corner", .25], ["Weekend brunch", "Neighborhood cafe", .19]] },
      { category: "Transport", fraction: .52, entries: [["Commute to the office", "Grab", .22], ["Fuel top-up", "Petrolimex", .38], ["Evening ride home", "Grab", .18], ["Monthly parking pass", "Building parking", .22]] },
      { category: "Daily", fraction: .26, entries: [["Internet and mobile plan", "FPT Telecom", .34], ["Laundry and household supplies", "Local laundry", .18], ["Monthly gym membership", "Neighborhood gym", .32], ["A birthday card and small gift", "Book street", .16]] },
      { category: "Tech", fraction: .4, entries: [["USB-C cable replacement", "Electronics store", .45], ["Cloud storage subscription", "Cloud storage", .55]] },
      { category: "Saving", fraction: 1, entries: [["Monthly emergency fund contribution", "Savings transfer", 1]] },
      { category: "Tithe", fraction: 1, entries: [["Monthly giving", "Community fund", 1]] },
      { category: "Travel", fraction: .2, entries: [["Japan travel fund contribution", "Travel savings", 1]] },
    ];
    for (const offset of [-1, 0]) {
      const { start, end } = periodBounds(now, settings.monthStartDay, offset);
      const cutoff = offset === 0 ? now : addDays(end, -1);
      const span = Math.max(0, Math.floor((cutoff.getTime() - start.getTime()) / 86400000));
      const periodKey = `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
      for (const pattern of patterns) {
        const category = categories.get(pattern.category)!;
        const existing = await tx.purchase.aggregate({
          where: { categoryId: category.id, occurredAt: { gte: start, lt: end }, NOT: { id: { startsWith: prefix } } }, _sum: { amount: true },
        });
        const target = (category.budget ?? 0) * pattern.fraction * (offset === -1 ? .94 : 1);
        const available = Math.max(0, round2(target - (existing._sum.amount ?? 0)));
        // Keep existing spending and budget choices intact; only fill remaining room.
        for (const [index, [description, merchant, weight]] of pattern.entries.entries()) {
          const amount = round2(available * weight);
          if (amount < 1) continue;
          const occurredAt = addDays(start, Math.min(span, Math.round(span * (index + 1) / (pattern.entries.length + 1))));
          occurredAt.setHours(10 + index * 2, 15, 0, 0);
          if (occurredAt > cutoff) occurredAt.setTime(cutoff.getTime());
          const id = `${prefix}purchase-${periodKey}-${pattern.category.toLowerCase()}-${index}`;
          await tx.purchase.upsert({ where: { id }, update: {}, create: { id, description, merchant, amount, categoryId: category.id, occurredAt, userCategorized: true } });
        }
      }
    }

    const highestSequence = await tx.milestone.aggregate({ _max: { sequence: true } });
    const milestones = [
      { key: "workday", title: "Make the workday easier", rationale: "Start with two useful desk upgrades. Review either item individually or pay for both together.", items: [
        { key: "stand", name: "Adjustable aluminum laptop stand", price: 39.9, priority: "HIGH", category: "Tech", days: 14, notes: "A sturdy, foldable stand for a more comfortable workday. Sample target price." },
        { key: "lamp", name: "Warm-light desk lamp", price: 34.5, priority: "MEDIUM", category: "Daily", days: 21, notes: "Dimmable, warm light for evening reading. Sample target price." },
      ] },
      { key: "everyday", title: "A little more comfort", rationale: "Space out these everyday upgrades after essential bills and savings are covered.", items: [
        { key: "keyboard", name: "Compact wireless keyboard", price: 79, priority: "MEDIUM", category: "Tech", days: 35, notes: "Quiet keys, compact layout, and support for two devices. Sample target price." },
        { key: "shoes", name: "Everyday walking shoes", price: 69.9, priority: "MEDIUM", category: "Daily", days: 45, notes: "Comfortable enough for daily walks and travel. Sample target price." },
      ] },
      { key: "travel", title: "Ready for the next trip", rationale: "Keep travel extras in a later milestone so they do not crowd out current priorities.", items: [
        { key: "bag", name: "Lightweight weekend backpack", price: 64.9, priority: "LOW", category: "Travel", days: 65, notes: "Carry-on size, laptop sleeve, and a water-bottle pocket. Sample target price." },
        { key: "powerbank", name: "10,000 mAh USB-C power bank", price: 29.9, priority: "LOW", category: "Tech", days: 70, notes: "A compact backup battery for long travel days. Sample target price." },
      ] },
    ];
    for (const [index, milestone] of milestones.entries()) {
      const id = `${prefix}milestone-${milestone.key}`;
      await tx.milestone.upsert({ where: { id }, update: {}, create: { id, title: milestone.title, rationale: milestone.rationale, sequence: (highestSequence._max.sequence ?? 0) + index + 1 } });
      for (const item of milestone.items) {
        const itemId = `${prefix}item-${item.key}`;
        await tx.desiredItem.upsert({ where: { id: itemId }, update: {}, create: { id: itemId, name: item.name, targetPrice: item.price, priority: item.priority, category: item.category, notes: item.notes, targetDate: addDays(now, item.days), milestoneId: id } });
      }
    }

    const groupDefinitions = [
      { key: "dalat", name: "Da Lat weekend · sample", expenses: [
        { name: "Two nights at the hillside homestay", payer: 0, cents: 24000, days: 9, category: "Travel" },
        { name: "Dinner after the night market", payer: 1, cents: 6840, days: 8, category: "Dining" },
        { name: "Airport transfers and local rides", payer: 2, cents: 4650, days: 8, category: "Transport" },
        { name: "Coffee, snacks and picnic supplies", payer: 1, cents: 3250, days: 7, category: "Groceries" },
      ] },
      { key: "dinner", name: "Sunday dinner club · sample", expenses: [
        { name: "Dinner for three at Pizza 4P's", payer: 1, cents: 8760, days: 4, category: "Dining" },
        { name: "Coffee and dessert", payer: 2, cents: 2430, days: 4, category: "Dining" },
        { name: "Ride home together", payer: 0, cents: 1260, days: 4, category: "Transport" },
      ] },
    ];
    for (const definition of groupDefinitions) {
      const groupId = `${prefix}group-${definition.key}`;
      await tx.group.upsert({ where: { id: groupId }, update: {}, create: { id: groupId, name: definition.name, currency: "USD" } });
      const members = [];
      for (const [index, account] of accounts.entries()) {
        const id = `${groupId}-member-${index}`;
        members.push(await tx.groupMember.upsert({ where: { id }, update: {}, create: { id, groupId, displayName: account.name, isSelf: account.isSelf, paypalAddress: account.email } }));
      }
      for (const [index, expense] of definition.expenses.entries()) {
        const id = `${groupId}-expense-${index}`;
        const share = Math.floor(expense.cents / members.length);
        await tx.groupExpense.upsert({ where: { id }, update: {}, create: {
          id, groupId, payerId: members[expense.payer].id, description: expense.name, amountCents: expense.cents,
          category: expense.category, occurredAt: addDays(now, -expense.days),
          shares: { create: members.map((member, i) => ({ id: `${id}-share-${i}`, memberId: member.id, amountCents: share + (i < expense.cents % members.length ? 1 : 0) })) },
        } });
      }
      if (definition.key === "dalat") {
        const id = `${groupId}-manual-repayment`;
        await tx.settlement.upsert({ where: { id }, update: {}, create: {
          id, groupId, senderId: members[2].id, recipientId: members[0].id, amountCents: 2000,
          status: "SETTLED", paymentReference: "manual", note: "Sample cash repayment for the trip. No PayPal payment was made.", settledAt: addDays(now, -5),
        } });
      }
    }
  }, { timeout: 30000 });
  console.log("Added notebook sample data: two budget periods, six wishlist items, three milestones, and two groups. Existing data and saved PayPal accounts preserved. No payments made.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
