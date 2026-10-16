import type { CategoryDTO, ItemDTO, MilestoneDTO, PurchaseDTO } from "./dto";
import type { SettingsDTO } from "./settings";
import type {
  BudgetAllocation,
  BudgetQuestion,
  BudgetQuestionsResult,
  BudgetSuggestion,
} from "./budget";
import type { CategoryGuess } from "./planner";
import type { Alternative } from "./alternatives";

export type { CategoryDTO, ItemDTO, MilestoneDTO, PurchaseDTO, SettingsDTO };
export type { BudgetAllocation, BudgetQuestion, BudgetQuestionsResult, BudgetSuggestion };
export type { CategoryGuess, Alternative };

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface StatusDTO {
  ollama: { configured: boolean; model: string; baseUrl: string };
  channel3: { configured: boolean };
  paypal: { configured: boolean; clientId: string; env: string; currency: string };
}

export interface SummaryDTO {
  currency: string;
  periodStart: string;
  totals: {
    budget: number;
    spent: number;
    remaining: number;
    allTimeSpent: number;
  };
  categories: CategoryDTO[];
  items: { total: number; purchased: number };
}

export interface PlanResponse {
  source?: "ollama" | "heuristic";
  monthlyBudget: number;
  milestones: MilestoneDTO[];
}

export interface AlternativesResponse {
  source: "channel3" | "fallback";
  alternatives: Alternative[];
}

export interface OrderResponse {
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  milestoneId: string;
  milestoneTitle: string;
  lines: Array<{ name: string; amount: number }>;
}

export interface CaptureResponse {
  orderId: string;
  status: string;
  captureId?: string;
  payerName?: string;
  milestoneId?: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
