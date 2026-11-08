"use client";

import { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  api,
  type CaptureResponse,
  type MilestoneDTO,
  type OrderResponse,
  type StatusDTO,
  type SummaryDTO,
} from "@/lib/client";
import { Alert, Modal, Money, Spinner } from "./ui";

export function CheckoutModal({
  milestone,
  status,
  summary,
  onClose,
  onPaid,
}: {
  milestone: MilestoneDTO | null;
  status: StatusDTO | null;
  summary: SummaryDTO | null;
  onClose: () => void;
  onPaid: (result: CaptureResponse) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CaptureResponse | null>(null);

  const currencyCode = summary?.currency ?? status?.paypal.currency ?? "USD";
  const clientId = status?.paypal.clientId || "";
  const configured = Boolean(status?.paypal.configured && clientId);

  const close = () => {
    setError(null);
    setDone(null);
    onClose();
  };

  return (
    <Modal open={Boolean(milestone)} onClose={close} title="Review & pay with PayPal" wide>
      {milestone && (
        <>
          <div className="mb-4 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>{milestone.title}</span>
              <span>{milestone.items.length} items</span>
            </div>
            <ul className="divide-y divide-slate-800">
              {milestone.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="truncate">{item.alternativeName ?? item.name}</span>
                  <span>
                    <Money amount={item.effectivePrice} currency={currencyCode} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-4 py-3 text-base font-semibold">
              <span>Total</span>
              <span>
                <Money amount={milestone.total} currency={currencyCode} />
              </span>
            </div>
          </div>

          {done ? (
            <Alert kind="info">
              Payment {done.status.toLowerCase()}
              {done.captureId ? ` · capture ${done.captureId}` : ""}. Items marked purchased.
            </Alert>
          ) : !configured ? (
            <Alert>
              PayPal sandbox is not configured. Add <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code>,{" "}
              <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> to <code>.env</code>{" "}
              and restart the dev server.
            </Alert>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Only the items listed above will be included in this payment.
              </p>
              <PayPalScriptProvider
                options={{ clientId, currency: currencyCode, intent: "capture" }}
              >
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect" }}
                  disabled={busy}
                  createOrder={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                      const order = await api.post<OrderResponse>("/api/paypal/orders", {
                        itemIds: milestone.items.map((item) => item.id),
                      });
                      return order.orderId;
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not create order");
                      throw e;
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onApprove={async (data, actions) => {
                    setError(null);
                    setBusy(true);
                    try {
                      const result = await api.post<CaptureResponse>(
                        `/api/paypal/orders/${data.orderID}/capture`,
                      );
                      setDone(result);
                      onPaid(result);
                    } catch (e) {
                      const message =
                        e instanceof Error ? e.message : "Capture failed";
                      setError(message);
                      // PayPal wants the payer to pick another funding source.
                      if (message.includes("INSTRUMENT_DECLINED")) {
                        setBusy(false);
                        await actions.restart();
                        return;
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onError={(e) => {
                    setError(e instanceof Error ? e.message : "PayPal error");
                  }}
                />
              </PayPalScriptProvider>
              {busy && (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <Spinner /> Working…
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
