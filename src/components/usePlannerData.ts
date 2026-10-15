"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ItemDTO,
  type PlanResponse,
  type PurchaseDTO,
  type StatusDTO,
  type SummaryDTO,
} from "@/lib/client";

export function usePlannerData() {
  const [status, setStatus] = useState<StatusDTO | null>(null);
  const [summary, setSummary] = useState<SummaryDTO | null>(null);
  const [purchases, setPurchases] = useState<PurchaseDTO[]>([]);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, sum, p, i, pl] = await Promise.all([
      api.get<StatusDTO>("/api/status"),
      api.get<SummaryDTO>("/api/summary"),
      api.get<PurchaseDTO[]>("/api/purchases"),
      api.get<ItemDTO[]>("/api/items"),
      api.get<PlanResponse>("/api/plan"),
    ]);
    setStatus(s);
    setSummary(sum);
    setPurchases(p);
    setItems(i);
    setPlan(pl);
  }, []);

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
