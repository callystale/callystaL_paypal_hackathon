import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { POST } from "../src/app/api/what-if/route";
import snapshot from "../demo/snapshot.json";
import type { WhatIfResponse } from "../src/lib/whatif";

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("file:/tmp/budgetpal-demo-")) throw new Error("Use an isolated /tmp/budgetpal-demo- database only.");
  const responses: Record<string, WhatIfResponse> = {};
  for (const item of snapshot.items) {
    const response = await POST(new Request("http://demo.local/api/what-if", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) }));
    if (!response.ok) throw new Error(`Could not capture ${item.name}`);
    const result = await response.json() as WhatIfResponse;
    if (result.assessment.source !== "ollama") throw new Error(`No genuine AI response for ${item.name}; existing captures left unchanged.`);
    responses[item.id] = { ...result, preRecorded: { model: "llama3.2:3b", capturedAt: new Date().toISOString() } };
    console.log(`Captured ${item.name}`);
  }
  await writeFile("demo/whatif.json", JSON.stringify(responses, null, 2) + "\n");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
