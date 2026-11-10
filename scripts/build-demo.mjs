import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir("demo-dist", { recursive: true });
await build({ entryPoints: ["demo/main.tsx"], bundle: true, outfile: "demo-dist/app.js", minify: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, loader: { ".css": "empty" } });
execFileSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js", "-i", "src/app/globals.css", "-o", "demo-dist/style.css", "--content", "./demo/**/*.tsx,./src/components/ui.tsx", "--minify"], { stdio: "inherit" });
await writeFile("demo-dist/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Explore BudgetPal with sample spending, preloaded local AI responses, and a PayPal Sandbox walkthrough."><title>BudgetPal | Interactive demo</title><link rel="stylesheet" href="./style.css"></head><body><div id="root"></div><script defer src="./app.js"></script></body></html>`);
await writeFile("demo-dist/.nojekyll", "");
console.log("Static GitHub Pages demo built in demo-dist/");
