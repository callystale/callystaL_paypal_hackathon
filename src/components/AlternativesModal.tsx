"use client";

import { useEffect, useState } from "react";
import { api, type AlternativesResponse, type ItemDTO, type SummaryDTO } from "@/lib/client";
import { Alert, Modal, Money, Spinner } from "./ui";

function ProductPhoto({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
      {src && !failed ? (
        // Retailer image hosts vary, so render the provider URL directly.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="text-center text-xs text-slate-500">Photo unavailable</span>
      )}
    </div>
  );
}

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
    let active = true;
    api
      .post<AlternativesResponse>("/api/alternatives", { itemId: item.id })
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Search failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
        <p className="mb-4 text-sm text-slate-400">
          Your target price is{" "}
          <span className="font-medium text-slate-200">
            <Money amount={item.targetPrice} currency={currencyCode} />
          </span>
          . The AI recommends; you choose.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
          <Spinner /> Searching similar products…
        </div>
      )}
      {error && <Alert>{error}</Alert>}

      {data && (
        <>
          {data.source === "fallback" && (
            <div className="mb-3">
              <Alert kind="info">
                Demo options with estimated prices. Live product photos and retailer prices are unavailable.
              </Alert>
            </div>
          )}
          <div className="space-y-3">
            {data.alternatives.map((alt) => (
              <div
                key={`${alt.title}-${alt.merchant}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 p-3"
              >
                <ProductPhoto key={alt.imageUrl ?? alt.title} src={alt.imageUrl} title={alt.title} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{alt.title}</p>
                  <p className="mt-1 text-lg font-semibold">
                    <Money amount={alt.price} currency={alt.currency} />
                    {data.source === "fallback" && <span className="ml-2 text-xs font-normal text-slate-400">estimated</span>}
                  </p>
                  <p className="text-xs text-slate-400">{alt.reason}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {alt.merchant} · {alt.availability}
                    {alt.savings > 0 && (
                      <span className="ml-2 font-medium text-emerald-400">
                        saves <Money amount={alt.savings} currency={alt.currency} />
                      </span>
                    )}
                    {alt.savings < 0 && (
                      <span className="ml-2 font-medium text-rose-400">
                        +<Money amount={Math.abs(alt.savings)} currency={alt.currency} /> over target
                      </span>
                    )}
                  </p>
                </div>
                {alt.url && data.source !== "fallback" && (
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost text-xs"
                  >
                    View at retailer ↗
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
              <p className="text-sm text-slate-400">No alternatives found for this item.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
