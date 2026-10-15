import { ollamaJson, type ChatMessage } from "./ollama";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface PlanItem {
  id: string;
  name: string;
  targetPrice: number;
  priority: Priority;
  targetDate?: string | null;
  category?: string | null;
  notes?: string | null;
}

export interface PlanCategory {
  name: string;
  budget: number | null;
  spent: number;
}

export interface AiPlanMilestone {
  title: string;
  rationale: string;
  itemIds: string[];
}

export interface GeneratedPlan {
  source: "ollama" | "heuristic";
  monthlyBudget: number;
  milestones: AiPlanMilestone[];
}

export interface CategoryGuess {
  source: "ollama" | "heuristic";
  categoryName: string;
  confidence: number;
  reason: string;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const SYNONYMS: Record<string, string[]> = {
  groceries: [
    "grocery", "groceries", "supermarket", "produce", "whole foods", "trader joe",
    "costco", "kroger", "safeway", "aldi", "food", "milk", "eggs", "pantry",
  ],
  dining: [
    "restaurant", "dining", "cafe", "coffee", "lunch", "dinner", "brunch",
    "starbucks", "doordash", "ubereats", "grubhub", "pizza", "bar", "takeout",
  ],
  transport: [
    "uber", "lyft", "transit", "metro", "gas", "fuel", "parking", "flight",
    "airline", "bus", "train", "taxi", "commute",
  ],
  tech: [
    "tech", "electronics", "laptop", "phone", "monitor", "keyboard", "headphones",
    "usb", "hub", "apple", "software", "subscription", "gadget", "ssd",
  ],
  entertainment: ["netflix", "spotify", "movie", "cinema", "game", "concert", "streaming"],
  utilities: ["electric", "water", "internet", "bill", "utility", "phone plan", "rent"],
  health: ["pharmacy", "gym", "doctor", "clinic", "medical", "fitness", "vitamin"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function tokenized(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

/** Estimate how much money is free for goals each month. */
export function estimateMonthlyBudget(categories: PlanCategory[]): number {
  const withBudget = categories.filter((c) => c.budget != null && c.budget > 0);
  if (withBudget.length === 0) return 500;

  let headroom = 0;
  for (const c of withBudget) {
    const remaining = (c.budget as number) - c.spent;
    headroom += Math.max(remaining, 0);
  }
  // Goals should not consume the entire remaining monthly headroom.
  return Math.max(Math.round(headroom * 0.6), 50);
}

/**
 * Greedy fallback: highest priority and soonest target first, packed into
 * milestones that each stay within the monthly budget.
 */
export function heuristicPlan(
  items: PlanItem[],
  monthlyBudget: number,
): AiPlanMilestone[] {
  const sorted = [...items].sort((a, b) => {
    const p = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (p !== 0) return p;
    const da = a.targetDate ? Date.parse(a.targetDate) : Infinity;
    const db = b.targetDate ? Date.parse(b.targetDate) : Infinity;
    if (da !== db) return da - db;
    return a.targetPrice - b.targetPrice;
  });

  const milestones: AiPlanMilestone[] = [];
  let current: PlanItem[] = [];
  let running = 0;

  const flush = () => {
    if (current.length === 0) return;
    const total = current.reduce((s, i) => s + i.targetPrice, 0);
    const seq = milestones.length + 1;
    const focus = current[0];
    milestones.push({
      title: `Milestone ${seq}`,
      rationale: `Fits within ${Math.round(monthlyBudget)} this cycle. Starts with ${
        focus.priority === "HIGH" ? "high-priority" : focus.priority.toLowerCase() + "-priority"
      } "${focus.name}". Total ${Math.round(total)}.`,
      itemIds: current.map((i) => i.id),
    });
    current = [];
    running = 0;
  };

  for (const item of sorted) {
    if (current.length > 0 && running + item.targetPrice > monthlyBudget) {
      flush();
    }
    current.push(item);
    running += item.targetPrice;
  }
  flush();

  return milestones;
}

export async function generatePlan(input: {
  items: PlanItem[];
  categories: PlanCategory[];
  monthlyBudget: number;
}): Promise<GeneratedPlan> {
  const { items, categories, monthlyBudget } = input;

  if (items.length === 0) {
    return { source: "heuristic", monthlyBudget, milestones: [] };
  }

  const categoryLines = categories
    .map((c) => `- ${c.name}: budget ${c.budget ?? "none"}, spent ${c.spent.toFixed(2)}`)
    .join("\n");

  const itemLines = items
    .map(
      (i) =>
        `- id=${i.id} | ${i.name} | target price ${i.targetPrice} | priority ${i.priority}` +
        (i.targetDate ? ` | target date ${i.targetDate.slice(0, 10)}` : "") +
        (i.category ? ` | category ${i.category}` : ""),
    )
    .join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a careful personal budgeting assistant. You group a shopping wishlist " +
        "into staged, affordable milestones. You never invent items. You only use the " +
        "item ids provided. Respond with strict JSON only.",
    },
    {
      role: "user",
      content:
        `Available budget per milestone: ${monthlyBudget} (currency units).\n` +
        `Spending categories:\n${categoryLines || "(none)"}\n\n` +
        `Wishlist items:\n${itemLines}\n\n` +
        "Group EVERY item id into one or more milestones ordered from first to last. " +
        "Each milestone's summed target prices MUST NOT exceed the available budget per " +
        "milestone. Put higher-priority and sooner-dated items earlier. Assign each item " +
        "to exactly one milestone.\n" +
        "Return JSON shaped exactly like:\n" +
        '{"milestones":[{"title":"string","rationale":"one sentence","itemIds":["id1"]}]}',
    },
  ];

  try {
    const data = await ollamaJson<{ milestones: AiPlanMilestone[] }>(messages, {
      temperature: 0.2,
      timeoutMs: 90_000,
    });

    const valid = validateMilestones(data.milestones ?? [], items);
    if (valid) {
      return { source: "ollama", monthlyBudget, milestones: valid };
    }
  } catch {
    // fall through to heuristic
  }

  return {
    source: "heuristic",
    monthlyBudget,
    milestones: heuristicPlan(items, monthlyBudget),
  };
}

function validateMilestones(
  milestones: AiPlanMilestone[],
  items: PlanItem[],
): AiPlanMilestone[] | null {
  if (!Array.isArray(milestones) || milestones.length === 0) return null;

  const ids = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  const cleaned: AiPlanMilestone[] = [];

  for (const m of milestones) {
    const itemIds = (m.itemIds ?? []).filter((id) => ids.has(id) && !seen.has(id));
    if (itemIds.length === 0) continue;
    itemIds.forEach((id) => seen.add(id));
    cleaned.push({
      title: (m.title || `Milestone ${cleaned.length + 1}`).slice(0, 80),
      rationale: (m.rationale || "").slice(0, 400),
      itemIds,
    });
  }

  // Every item must be placed, otherwise trust the heuristic instead.
  if (seen.size !== items.length) return null;
  return cleaned;
}

export async function categorizePurchase(input: {
  description: string;
  merchant?: string | null;
  categories: string[];
}): Promise<CategoryGuess> {
  const { description, merchant, categories } = input;
  const text = `${description} ${merchant ?? ""}`.trim();

  if (categories.length > 0) {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You categorize personal finance transactions. Choose exactly one category " +
          "from the provided list or 'Uncategorized'. Respond with strict JSON only.",
      },
      {
        role: "user",
        content:
          `Transaction: "${text}"\n` +
          `Allowed categories: ${categories.join(", ")}, Uncategorized\n` +
          'Return JSON: {"categoryName":"string","confidence":0.0-1.0,"reason":"short"}',
      },
    ];

    try {
      const guess = await ollamaJson<{
        categoryName: string;
        confidence: number;
        reason: string;
      }>(messages, { temperature: 0, timeoutMs: 30_000 });

      const match = categories.find(
        (c) => c.toLowerCase() === (guess.categoryName || "").toLowerCase(),
      );
      if (match) {
        return {
          source: "ollama",
          categoryName: match,
          confidence: clamp01(guess.confidence ?? 0.7),
          reason: (guess.reason || "Matched by the model.").slice(0, 200),
        };
      }
    } catch {
      // fall through to heuristic
    }
  }

  return heuristicCategorize(text, categories);
}

export function heuristicCategorize(text: string, categories: string[]): CategoryGuess {
  const lower = normalize(text);

  for (const category of categories) {
    if (lower.includes(normalize(category).trim())) {
      return {
        source: "heuristic",
        categoryName: category,
        confidence: 0.8,
        reason: `Description mentions "${category}".`,
      };
    }
  }

  let bestCat: string | null = null;
  let bestScore = 0;
  for (const category of categories) {
    const words = tokenized(category);
    let score = 0;
    for (const word of words) {
      if (word.length < 3) continue;
      if (lower.includes(word)) score += 1;
      const synonyms = SYNONYMS[word] ?? [];
      if (synonyms.some((syn) => lower.includes(syn))) score += 2;
    }
    for (const keys of Object.values(SYNONYMS)) {
      if (keys.some((k) => lower.includes(k))) {
        const groupMatchesCategory = words.some((w) =>
          keys.some((k) => k.includes(w) || w.includes(k)),
        );
        if (groupMatchesCategory) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = category;
    }
  }

  if (bestCat && bestScore > 0) {
    return {
      source: "heuristic",
      categoryName: bestCat,
      confidence: Math.min(0.4 + bestScore * 0.1, 0.85),
      reason: "Matched by keyword.",
    };
  }

  return {
    source: "heuristic",
    categoryName: categories[0] ?? "Uncategorized",
    confidence: 0.2,
    reason: "No strong signal; defaulted.",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
