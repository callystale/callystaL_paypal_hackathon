import { ollamaJson, type ChatMessage } from "./ollama";
import { round2 } from "./money";

export interface BudgetCategoryInput {
  name: string;
  budget?: number | null;
  spent?: number;
}

export interface BudgetQuestion {
  id: string;
  question: string;
  hint?: string;
}

export interface BudgetQuestionsInput {
  salary: number;
  goals?: string | null;
  categories: BudgetCategoryInput[];
}

export interface BudgetQuestionsResult {
  source: "ollama" | "heuristic";
  questions: BudgetQuestion[];
}

export interface BudgetAllocation {
  category: string;
  amount: number;
}

export interface BudgetSuggestInput {
  salary: number;
  goals?: string | null;
  instruction?: string | null;
  /** Allow the model to add a new category when the prompt needs one. */
  allowNew?: boolean;
  answers?: Array<{ question: string; answer: string }>;
  categories: BudgetCategoryInput[];
}

export interface BudgetSuggestion {
  source: "ollama" | "heuristic";
  allocations: BudgetAllocation[];
  explanation: string;
  /** Monthly income minus the allocated total. Negative means over income. */
  unallocated: number;
  /** How far the user's goals + fixed costs exceed income (0 when they fit). */
  shortfall: number;
}

const RESERVED_CATEGORY_NAMES = new Set([
  // Meta words models sometimes leak in as if they were categories.
  "shortfall",
  "total",
  "totals",
  "subtotal",
  "sum",
  "balance",
  "unallocated",
  "remaining",
  "allocated",
  "income",
  "monthly income",
  "total income",
]);

const DEFAULT_QUESTIONS: BudgetQuestion[] = [
  {
    id: "fixed",
    question: "What are your fixed monthly costs (rent, utilities, debt payments)?",
    hint: "Anything you must pay every month.",
  },
  {
    id: "goals",
    question: "What are you saving or investing for right now?",
    hint: "e.g. a $600 trip in six months",
  },
  {
    id: "limits",
    question: "Which categories should you limit, and which must stay covered?",
    hint: "e.g. spend less on takeout, keep groceries covered",
  },
  {
    id: "timeline",
    question: "Any upcoming one-off expenses or deadlines?",
    hint: "Optional",
  },
];

/**
 * Asks the model for a few budgeting questions tailored to the user's income,
 * categories and stated goals. Falls back to a generic question set.
 */
export async function budgetQuestions(
  input: BudgetQuestionsInput,
): Promise<BudgetQuestionsResult> {
  const { salary, goals, categories } = input;
  if (categories.length === 0) {
    return { source: "heuristic", questions: DEFAULT_QUESTIONS };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a friendly personal budgeting coach. You ask a few short questions to " +
        "learn the user's fixed costs, goals, priorities and deadlines so you can later " +
        "split their income across their categories. Ask ONLY questions — never allocate " +
        "money or invent categories. Respond with strict JSON only.",
    },
    {
      role: "user",
      content:
        `Monthly take-home income: ${salary}.\n` +
        `Categories: ${categories.map((c) => c.name).join(", ")}.\n` +
        (goals ? `What they said matters: "${goals}"\n` : "") +
        "\nAsk 3 to 4 concise questions that would most change how you split this income. " +
        "Include a short hint for each.\n" +
        'Return JSON: {"questions":[{"id":"q1","question":"...","hint":"..."}]}',
    },
  ];

  try {
    const data = await ollamaJson<{ questions: BudgetQuestion[] }>(messages, {
      temperature: 0.4,
      timeoutMs: 60_000,
    });
    const cleaned = (data.questions ?? [])
      .filter((q) => q && typeof q.question === "string" && q.question.trim().length > 0)
      .slice(0, 5)
      .map((q, i) => ({
        id: (typeof q.id === "string" && q.id ? q.id : `q${i + 1}`).slice(0, 20),
        question: q.question.trim().slice(0, 200),
        hint: typeof q.hint === "string" && q.hint.trim() ? q.hint.trim().slice(0, 120) : undefined,
      }));
    if (cleaned.length > 0) return { source: "ollama", questions: cleaned };
  } catch {
    // fall through to defaults
  }

  return { source: "heuristic", questions: DEFAULT_QUESTIONS };
}

/**
 * Splits the monthly income across the provided categories, honoring goals,
 * fixed costs, priorities and an optional revision instruction. Falls back to
 * a weighted heuristic when the model is unavailable or returns invalid JSON.
 */
export async function suggestBudgetSplit(
  input: BudgetSuggestInput,
): Promise<BudgetSuggestion> {
  const { salary, goals, instruction, answers, categories, allowNew } = input;
  if (salary <= 0 || categories.length === 0) return heuristicSplit(input);

  const splitLines = categories
    .map((c) => {
      const amount = c.budget && c.budget > 0 ? round2(c.budget) : 0;
      const spent = c.spent ? `, spent ${round2(c.spent)} so far` : "";
      return `- ${c.name}: ${amount}${spent}`;
    })
    .join("\n");

  const answerLines = (answers ?? [])
    .filter((a) => a.answer.trim().length > 0)
    .map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`)
    .join("\n");

  const revision = (instruction ?? "").trim();
  const revising = revision.length > 0;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a personal budgeting assistant that EDITS a monthly budget. " +
        "Given the income, the current split and the user's request, you return the full, " +
        "updated split. You always apply the user's requested change to the numbers — never " +
        "just describe the budget or reply that nothing can be done. Keep the total equal to " +
        "the income. When no request is given, you propose a sensible split instead. " +
        (allowNew ? "You may add a new category if the request clearly needs one. " : "") +
        "Respond with strict JSON only.",
    },
    {
      role: "user",
      content:
        `Monthly take-home income: ${salary}.\n\n` +
        `Current split:\n${splitLines}\n` +
        (goals ? `\nUser's goals & priorities: "${goals}"\n` : "") +
        (answerLines ? `\nAnswers to your earlier questions:\n${answerLines}\n` : "") +
        (revising
          ? `\nThe user now asks for this change: "${revision}". ` +
            `Apply it to the numbers and return the full updated split for every category. ` +
            `Do not reply that it is impossible — make the best adjustment you can and explain it.\n`
          : `\nPropose a monthly amount for each category.\n`) +
        `\nRules: give a monthly amount for EVERY category. Amounts must be >= 0 and should ` +
        `add up to ${salary}. If fixed costs and goals genuinely exceed the income, set ` +
        `"shortfall" to the positive amount they exceed it by. Write "explanation" as 1-2 ` +
        `sentences spoken directly TO the user (use "you"), stating what you changed and why.\n` +
        'Return JSON: {"allocations":[{"category":"name","amount":0}],"explanation":"...","shortfall":0}',
    },
  ];

  try {
    const data = await ollamaJson<{
      allocations: BudgetAllocation[];
      explanation: string;
      shortfall?: number;
    }>(messages, { temperature: revising ? 0.1 : 0.2, timeoutMs: 90_000 });

    const validated = normalizeAllocations(data.allocations ?? [], categories, Boolean(allowNew));
    if (validated) {
      const allocatedSum = round2(validated.reduce((s, a) => s + a.amount, 0));
      const shortfall =
        typeof data.shortfall === "number" && Number.isFinite(data.shortfall) && data.shortfall > 0
          ? round2(data.shortfall)
          : 0;
      const fallbackExplanation = revising
        ? "I updated your split based on your request — edit any amount you like."
        : "Here is a starting split — edit any amount you like.";
      return {
        source: "ollama",
        allocations: validated,
        explanation: (data.explanation || fallbackExplanation).slice(0, 600),
        unallocated: round2(salary - allocatedSum),
        shortfall,
      };
    }
  } catch {
    // fall through to heuristic
  }

  return heuristicSplit(input);
}

/**
 * Keeps a clean allocation. Every provided category must be present, otherwise
 * the model's output is rejected. When `allowNew` is set, categories the model
 * returns that aren't in the list are kept too (they become new categories).
 */
function normalizeAllocations(
  raw: BudgetAllocation[],
  categories: BudgetCategoryInput[],
  allowNew: boolean,
): BudgetAllocation[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const byName = new Map<string, BudgetAllocation>();
  for (const a of raw) {
    if (!a || typeof a.category !== "string" || !a.category.trim()) continue;
    const amount = typeof a.amount === "number" ? a.amount : Number(a.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const name = a.category.trim().slice(0, 60);
    byName.set(name.toLowerCase(), { category: name, amount: round2(amount) });
  }

  const provided = new Set(categories.map((c) => c.name.trim().toLowerCase()));
  const out: BudgetAllocation[] = [];
  for (const c of categories) {
    const hit = byName.get(c.name.trim().toLowerCase());
    if (!hit) return null; // a provided category is missing -> reject
    out.push({ category: c.name, amount: hit.amount });
  }

  if (allowNew) {
    let added = 0;
    for (const [key, value] of byName) {
      if (added >= 5) break; // don't let one prompt explode the category list
      if (provided.has(key)) continue;
      if (key.length < 2 || RESERVED_CATEGORY_NAMES.has(key)) continue;
      if (value.amount <= 0) continue; // ignore empty invented categories
      out.push(value);
      added++;
    }
  }

  return out;
}

/** Deterministic fallback: weighted by current amounts, else split evenly. */
function heuristicSplit(input: BudgetSuggestInput): BudgetSuggestion {
  const { salary, categories } = input;

  if (categories.length === 0 || salary <= 0) {
    return {
      source: "heuristic",
      allocations: categories.map((c) => ({ category: c.name, amount: 0 })),
      explanation: "Add a monthly income and at least one category to plan your budget.",
      unallocated: Math.max(salary, 0),
      shortfall: 0,
    };
  }

  const weights = categories.map((c) => (c.budget && c.budget > 0 ? c.budget : 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const allocations = categories.map((c, i) => ({
    category: c.name,
    amount:
      totalWeight > 0
        ? round2((weights[i] / totalWeight) * salary)
        : round2(salary / categories.length),
  }));

  const drift = round2(salary - allocations.reduce((s, a) => s + a.amount, 0));
  allocations[allocations.length - 1].amount = round2(allocations[allocations.length - 1].amount + drift);

  return {
    source: "heuristic",
    allocations,
    explanation:
      "A balanced starting point split across your categories — adjust any amount to match your priorities.",
    unallocated: 0,
    shortfall: 0,
  };
}
