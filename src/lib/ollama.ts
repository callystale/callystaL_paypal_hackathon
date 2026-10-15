export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface OllamaOptions {
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

function baseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
}

function model(): string {
  return process.env.OLLAMA_MODEL || "llama3.2:3b";
}

/**
 * Returns true when the local Ollama daemon responds. Used by the UI to show
 * whether plan generation will run live or fall back to the heuristic engine.
 */
export async function ollamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl()}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaChat(
  messages: ChatMessage[],
  opts: OllamaOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: model(),
        messages,
        stream: false,
        ...(opts.json ? { format: "json" } : {}),
        options: {
          temperature: opts.temperature ?? 0.2,
          num_predict: 1024,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pulls the first balanced JSON value out of a model response. Small local
 * models sometimes wrap JSON in prose or code fences, so we are forgiving.
 */
export function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to bracket extraction
  }

  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i !== -1);
  if (starts.length === 0) throw new Error("Model did not return JSON");
  const start = Math.min(...starts);

  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("Model returned unbalanced JSON");
}

export async function ollamaJson<T>(
  messages: ChatMessage[],
  opts: OllamaOptions = {},
): Promise<T> {
  const raw = await ollamaChat(messages, { ...opts, json: true });
  return parseJson<T>(raw);
}
