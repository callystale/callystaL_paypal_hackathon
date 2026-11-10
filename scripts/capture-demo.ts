import { writeFile } from "node:fs/promises";
import { generatePlan, type PlanItem } from "../src/lib/planner";
import scenario from "../demo/scenario.json";

async function main() {
// Only this synthetic scenario is captured. Never export the personal database.
const input = { ...scenario, items: scenario.items as PlanItem[] };
const plan = await generatePlan(input);
if (plan.source !== "ollama") {
  throw new Error("No genuine Ollama response received. Existing demo capture was left unchanged.");
}
const ids = plan.milestones.flatMap((milestone) => milestone.itemIds);
if (ids.length !== input.items.length || new Set(ids).size !== input.items.length ||
    plan.milestones.some((milestone) => milestone.itemIds.reduce((sum, id) =>
      sum + (input.items.find((item) => item.id === id)?.targetPrice ?? Infinity), 0) > input.monthlyBudget)) {
  throw new Error("Captured plan failed coverage or affordability checks.");
}
await writeFile(new URL("../demo/ai-response.json", import.meta.url), JSON.stringify({
  source: "ollama", model: process.env.OLLAMA_MODEL || "llama3.2:3b",
  capturedAt: new Date().toISOString(), scenario: input, plan,
}, null, 2) + "\n");
console.log("Saved validated Ollama response for synthetic demo data.");

}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
