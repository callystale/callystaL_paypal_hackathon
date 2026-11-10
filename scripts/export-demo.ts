import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { GET as settings } from "../src/app/api/settings/route";
import { GET as summary } from "../src/app/api/summary/route";
import { GET as purchases } from "../src/app/api/purchases/route";
import { GET as items } from "../src/app/api/items/route";
import { GET as groups } from "../src/app/api/groups/route";
import { GET as group } from "../src/app/api/groups/[id]/route";
import { POST as plan } from "../src/app/api/plan/route";
import { budgetQuestions, suggestBudgetSplit } from "../src/lib/budget";

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("file:/tmp/budgetpal-demo-")) throw new Error("Use a dedicated /tmp/budgetpal-demo- database only.");
  const request = new Request("http://demo.local/api/plan");
  const groupList = await (await groups()).json();
  const snapshot = {
    capturedAt: new Date().toISOString(), model: "llama3.2:3b",
    settings: await (await settings()).json(),
    summary: await (await summary(new Request("http://demo.local/api/summary"))).json(),
    purchases: await (await purchases()).json(), items: await (await items()).json(),
    groups: await Promise.all(groupList.map(async (g: {id: string}) => (await group(request, { params: { id: g.id } })).json())),
    plan: await (await plan(request)).json(),
    questions: null as unknown, suggestion: null as unknown,
  };
  if (snapshot.plan.source !== "ollama") throw new Error("Expected genuine saved Ollama plan.");
  const input = { salary: snapshot.settings.salary, goals: snapshot.settings.goals, categories: snapshot.summary.categories };
  snapshot.questions = await budgetQuestions(input);
  snapshot.suggestion = await suggestBudgetSplit(input);
  await writeFile("demo/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
  console.log("Saved full application demo fixtures from isolated synthetic seed data.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
