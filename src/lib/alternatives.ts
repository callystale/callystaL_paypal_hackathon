import { searchProducts } from "./channel3";
import { ollamaJson, type ChatMessage } from "./ollama";

export interface Alternative {
  title: string;
  imageUrl?: string;
  price: number;
  currency: string;
  merchant: string;
  url: string;
  availability: string;
  savings: number;
  reason: string;
}

export interface AlternativesResult {
  source: "channel3" | "fallback";
  alternatives: Alternative[];
}

export async function findAlternatives(input: {
  name: string;
  targetPrice: number;
  notes?: string | null;
}): Promise<AlternativesResult> {
  const { products, source } = await searchProducts(input.name, {
    referencePrice: input.targetPrice,
    limit: 6,
  });

  const candidates = products
    .map((p): Alternative | null => {
      const offer = p.bestOffer;
      if (!offer) return null;
      const savings = Math.round((input.targetPrice - offer.price) * 100) / 100;
      return {
        title: p.title,
        imageUrl: p.imageUrl,
        price: offer.price,
        currency: offer.currency,
        merchant: offer.merchant,
        url: offer.url,
        availability: offer.availability,
        savings,
        reason: "",
      } satisfies Alternative;
    })
    .filter((a): a is Alternative => a !== null)
    .sort((a, b) => a.price - b.price)
    .slice(0, 4);

  if (candidates.length === 0) {
    return { source, alternatives: [] };
  }

  const reasons = await describeAlternatives(input, candidates).catch(() => null);
  const alternatives = candidates.map((c, i) => ({
    ...c,
    reason:
      reasons?.[i] ??
      `Priced ${c.savings >= 0 ? "below" : "above"} your target by ${Math.abs(
        c.savings,
      ).toFixed(2)}${c.savings >= 0 ? "" : " (over budget)"}.`,
  }));

  return { source, alternatives };
}

/**
 * Best-effort: ask the local model for a one-line comparison of each option.
 * If the model is slow or unavailable we keep the deterministic reasons.
 */
async function describeAlternatives(
  input: { name: string; targetPrice: number; notes?: string | null },
  candidates: Alternative[],
): Promise<string[]> {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.title} — ${c.price} ${c.currency} at ${c.merchant} (${c.availability})`,
    )
    .join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You compare shopping options for a budget-conscious buyer. For each option " +
        "write ONE short sentence weighing price, likely features and availability " +
        "against the user's item. Respond with strict JSON only.",
    },
    {
      role: "user",
      content:
        `Item wanted: ${input.name} (target price ${input.targetPrice}).` +
        (input.notes ? ` Notes: ${input.notes}.` : "") +
        `\nOptions:\n${list}\n` +
        'Return JSON: {"reasons":["sentence for option 1","sentence for option 2", ...]}',
    },
  ];

  const data = await ollamaJson<{ reasons: string[] }>(messages, {
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  const reasons = data.reasons ?? [];
  if (!Array.isArray(reasons) || reasons.length === 0) {
    throw new Error("no reasons");
  }
  return candidates.map((_, i) => reasons[i] ?? "Similar option at a lower price.");
}
