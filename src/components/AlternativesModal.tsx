"use client";

import { useEffect, useState } from "react";
import { api, type AlternativesResponse, type ItemDTO, type SummaryDTO } from "@/lib/client";
import { Alert, Modal, Money, Spinner } from "./ui";

export function AlternativesModal({
  item,
  summary,
  run,
  onClose,
}: {
  item: ItemDTO | null;
  summary: SummaryDTO | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [data, setData] = useState<AlternativesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);

  const currencyCode = summary?.currency ?? "USD";

  useEffect(() => {
    if (!item) return;
    setData(null);
    setError(null);
    setLoading(true);
    api
      .post<AlternativesResponse>("/api/alternatives", { itemId: item.id })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Search failed"))
      .finally(() => setLoading(false));
  }, [item]);

  const swap = async (alt: AlternativesResponse["alternatives"][number]) => {
    if (!item) return;
    setSwapping(alt.title);
    await run(() =>
      api.patch(`/api/items/${item.id}`, {
        alternative: { name: alt.title, price: alt.price, url: alt.url || undefined },
      }),
    );
    setSwapping(null);
    onClose();
  };

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={`Lower-cost options for ${item?.name ?? ""}`} wide>
      {item && (
        <p className="mb-4 text-sm text-slate-500">
          Your target price is{" "}
          <span className="font-medium text-slate-700">
            <Money amount={item.targetPrice} currency={currencyCode} />
          </span>
          . The AI recommends; you choose.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Spinner /> Searching similar products…
        </div>
      )}
      {error && <Alert>{error}</Alert>}

      {data && (
        <>
          {data.source === "fallback" && (
            <div className="mb-3">
              <Alert kind="info">
                Showing the built-in fallback catalogue. Add a CHANNEL3_API_KEY for live retailers.
              </Alert>
            </div>
          )}
          <div className="space-y-3">
            {data.alternatives.map((alt) => (
              <div
                key={`${alt.title}-${alt.merchant}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{alt.title}</p>
                  <p className="truncate text-xs text-slate-500">{alt.reason}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {alt.merchant} · {alt.availability}
                    {alt.savings > 0 && (
                      <span className="ml-2 font-medium text-emerald-600">
                        saves <Money amount={alt.savings} currency={alt.currency} />
                      </span>
                    )}
                    {alt.savings < 0 && (
                      <span className="ml-2 font-medium text-rose-600">
                        +<Money amount={Math.abs(alt.savings)} currency={alt.currency} /> over target
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  <Money amount={alt.price} currency={alt.currency} />
                </span>
                {alt.url && (
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-xs"
                  >
                    View
                  </a>
                )}
                <button
                  className="btn-primary"
                  onClick={() => swap(alt)}
                  disabled={swapping !== null}
                >
                  {swapping === alt.title ? <Spinner /> : null} Swap in
                </button>
              </div>
            ))}
            {data.alternatives.length === 0 && (
              <p className="text-sm text-slate-500">No alternatives found for this item.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
