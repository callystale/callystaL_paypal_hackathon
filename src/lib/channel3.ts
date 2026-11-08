export interface ProductOffer {
  merchant: string;
  domain: string;
  price: number;
  currency: string;
  availability: string;
  url: string;
}

export interface ProductResult {
  id: string;
  title: string;
  brand?: string;
  imageUrl?: string;
  offers: ProductOffer[];
  bestOffer?: ProductOffer;
  /** True when the result came from the built-in fallback catalogue. */
  synthetic?: boolean;
}

interface Channel3RawOffer {
  merchant_domain?: string;
  domain?: string;
  url?: string;
  price?: unknown;
  currency?: string;
  availability?: string;
}

interface Channel3RawProduct {
  id?: string;
  title?: string;
  brand?: { name?: string } | string;
  images?: Array<{ url?: string; cleaned_url?: string | null; is_main_image?: boolean }>;
  offers?: Channel3RawOffer[];
}

interface Channel3SearchResponse {
  products?: Channel3RawProduct[];
  next_page_token?: string | null;
}

export function channel3Enabled(): boolean {
  return Boolean(process.env.CHANNEL3_API_KEY);
}

function apiBase(): string {
  return (process.env.CHANNEL3_API_URL || "https://api.trychannel3.com").replace(/\/$/, "");
}

function extractPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["amount", "value", "price", "current", "min"]) {
      const n = extractPrice(obj[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function normalize(raw: Channel3RawProduct): ProductResult | null {
  const offers: ProductOffer[] = (raw.offers ?? [])
    .map((o) => {
      const price = extractPrice(o.price);
      if (price === null) return null;
      const domain = o.merchant_domain || o.domain || "unknown";
      return {
        merchant: domain,
        domain,
        price,
        currency: o.currency ||
          (o.price && typeof o.price === "object" && "currency" in o.price &&
          typeof o.price.currency === "string" ? o.price.currency : "USD"),
        availability: o.availability || "Unknown",
        url: o.url || "",
      } satisfies ProductOffer;
    })
    .filter((o): o is ProductOffer => o !== null)
    .sort((a, b) => a.price - b.price);

  if (offers.length === 0) return null;

  return {
    id: raw.id || Math.random().toString(36).slice(2),
    title: raw.title || "Untitled product",
    brand: typeof raw.brand === "string" ? raw.brand : raw.brand?.name,
    imageUrl: (() => {
      const image = raw.images?.find((image) => image.is_main_image) ?? raw.images?.[0];
      return image?.cleaned_url || image?.url;
    })(),
    offers,
    bestOffer: offers[0],
  };
}

/** Deterministic hash so the fallback catalogue is stable across calls. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function estimateBasePrice(query: string, referencePrice?: number): number {
  if (referencePrice && referencePrice > 0) return referencePrice;
  const h = hashString(query.toLowerCase());
  return 60 + (h % 340);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/**
 * Deterministic offline catalogue. Produces plausible cheaper alternatives so
 * the whole "find lower-cost options" flow is demoable without a Channel3 key.
 */
export function fallbackProducts(
  query: string,
  referencePrice?: number,
  limit = 4,
): ProductResult[] {
  const base = estimateBasePrice(query, referencePrice);
  const slug = slugify(query) || "product";
  const variants: Array<{ label: string; factor: number; merchant: string; domain: string }> = [
    { label: "refurbished", factor: 0.58, merchant: "RefurbHub", domain: "refurbhub.example" },
    { label: "budget pick", factor: 0.72, merchant: "ValueMart", domain: "valuemart.example" },
    { label: "open-box", factor: 0.83, merchant: "OpenBox Deals", domain: "openbox.example" },
    { label: "value brand", factor: 0.91, merchant: "EverydayGoods", domain: "everydaygoods.example" },
  ];

  return variants.slice(0, limit).map((v, i) => {
    const price = Math.round(base * v.factor * 100) / 100;
    const title = `${query} — ${v.label}`;
    return {
      id: `fallback-${slug}-${i}`,
      title,
      brand: v.merchant,
      synthetic: true,
      offers: [
        {
          merchant: v.merchant,
          domain: v.domain,
          price,
          currency: "USD",
          availability: "InStock",
          url: `https://${v.domain}/p/${slug}`,
        },
      ],
      bestOffer: {
        merchant: v.merchant,
        domain: v.domain,
        price,
        currency: "USD",
        availability: "InStock",
        url: `https://${v.domain}/p/${slug}`,
      },
    } satisfies ProductResult;
  });
}

export interface SearchOptions {
  limit?: number;
  referencePrice?: number;
  maxPrice?: number;
}

/**
 * Searches Channel3 for real products. Falls back to the deterministic
 * catalogue when no API key is configured or the request fails.
 */
export async function searchProducts(
  query: string,
  opts: SearchOptions = {},
): Promise<{ products: ProductResult[]; source: "channel3" | "fallback" }> {
  const limit = opts.limit ?? 6;
  const key = process.env.CHANNEL3_API_KEY;

  if (!key) {
    return { products: fallbackProducts(query, opts.referencePrice, 4), source: "fallback" };
  }

  try {
    const filters: Record<string, unknown> = {};
    if (opts.maxPrice) filters.price = { max_price: opts.maxPrice };

    const res = await fetch(`${apiBase()}/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({
        query,
        ...(Object.keys(filters).length ? { filters } : {}),
        limit,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      throw new Error(`Channel3 search failed (${res.status})`);
    }

    const data = (await res.json()) as Channel3SearchResponse;
    const products = (data.products ?? [])
      .map(normalize)
      .filter((p): p is ProductResult => p !== null);

    if (products.length === 0) {
      return { products: fallbackProducts(query, opts.referencePrice, 4), source: "fallback" };
    }

    products.sort((a, b) => (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity));
    return { products, source: "channel3" };
  } catch {
    return { products: fallbackProducts(query, opts.referencePrice, 4), source: "fallback" };
  }
}
