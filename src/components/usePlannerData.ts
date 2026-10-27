"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ItemDTO,
  type PlanResponse,
  type PurchaseDTO,
  type SettingsDTO,
  type StatusDTO,
  type SummaryDTO,
} from "@/lib/client";

export function usePlannerData(summaryOffset = 0) {
  const [status, setStatus] = useState<StatusDTO | null>(null);
  const [summary, setSummary] = useState<SummaryDTO | null>(null);
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [purchases, setPurchases] = useState<PurchaseDTO[]>([]);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, sum, set, p, i, pl] = await Promise.all([
      api.get<StatusDTO>("/api/status"),
      api.get<SummaryDTO>(`/api/summary?offset=${summaryOffset}`),
      api.get<SettingsDTO>("/api/settings"),
      api.get<PurchaseDTO[]>("/api/purchases"),
      api.get<ItemDTO[]>("/api/items"),
      api.get<PlanResponse>(`/api/plan?offset=${summaryOffset}`),
    ]);
    setStatus(s);
    setSummary(sum);
    setSettings(set);
    setPurchases(p);
    setItems(i);
    setPlan(pl);
  }, [summaryOffset]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load data"))
      .finally(() => setLoading(false));
  }, [refresh]);

  return {
    status,
    summary,
    settings,
    purchases,
    items,
    plan,
    loading,
    error,
    setError,
    refresh,
    run,
  };
}
