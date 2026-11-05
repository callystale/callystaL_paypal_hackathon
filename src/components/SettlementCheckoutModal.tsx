"use client";

import { useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  api,
  type CaptureSettlementResponse,
  type GroupDetailDTO,
  type PayPalSettlementResponse,
  type StatusDTO,
  type SuggestedRepayment,
} from "@/lib/client";
import { fromCents } from "@/lib/group";
import { Alert, Modal, Money, Spinner } from "./ui";

export function SettlementCheckoutModal({
  group,
  repayment,
  status,
  onClose,
  onPaid,
}: {
  group: GroupDetailDTO;
  repayment: SuggestedRepayment | null;
  status: StatusDTO | null;
  onClose: () => void;
  onPaid: (result: CaptureSettlementResponse) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CaptureSettlementResponse | null>(null);
  // PayPalButtons callbacks can outlive a render, so keep the server id in a ref.
  const settlementIdRef = useRef<string | null>(null);

  const clientId = status?.paypal.clientId || "";
  const configured = Boolean(status?.paypal.configured && clientId);

  const close = () => {
    setError(null);
    setDone(null);
    settlementIdRef.current = null;
    onClose();
  };

  return (
    <Modal
      open={Boolean(repayment)}
      onClose={close}
      title="Settle up with PayPal"
      wide
    >
      {repayment && (
        <>
          <div className="mb-4 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>{group.name}</span>
              <span>PayPal Sandbox</span>
            </div>
            <dl className="divide-y divide-slate-800 text-sm">
              <div className="flex items-center justify-between px-4 py-2">
                <dt className="text-slate-400">From</dt>
                <dd>{repayment.fromName}</dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2">
                <dt className="text-slate-400">To</dt>
                <dd>{repayment.toName}</dd>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-base font-semibold">
                <dt>Amount</dt>
                <dd>
                  <Money
                    amount={fromCents(repayment.amountCents)}
                    currency={group.currency}
                  />
                </dd>
              </div>
            </dl>
          </div>

          {done ? (
            <Alert kind="info">
              Payment {done.status.toLowerCase()}
              {done.captureId ? ` · capture ${done.captureId}` : ""}. The repayment is now
              marked settled.
            </Alert>
          ) : !configured ? (
            <Alert>
              PayPal sandbox is not configured. Add <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code>,{" "}
              <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> to{" "}
              <code>.env</code> and restart the dev server. You can still mark this repayment
              settled manually.
            </Alert>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                The settlement is recorded only after PayPal confirms the capture.
              </p>
              <PayPalScriptProvider
                options={{ clientId, currency: group.currency, intent: "capture" }}
              >
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect" }}
                  disabled={busy}
                  createOrder={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                      const order = await api.post<PayPalSettlementResponse>(
                        `/api/groups/${group.id}/settlements/paypal`,
                        {
                          senderId: repayment.fromMemberId,
                          recipientId: repayment.toMemberId,
                          amountCents: repayment.amountCents,
                        },
                      );
                      settlementIdRef.current = order.settlementId;
                      return order.orderId;
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Could not create the PayPal order",
                      );
                      throw e;
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onApprove={async (_data, actions) => {
                    const settlementId = settlementIdRef.current;
                    if (!settlementId) {
                      setError("Missing settlement reference. Please try again.");
                      return;
                    }
                    setError(null);
                    setBusy(true);
                    try {
                      const result = await api.post<CaptureSettlementResponse>(
                        `/api/groups/${group.id}/settlements/${settlementId}/capture`,
                      );
                      setDone(result);
                      onPaid(result);
                    } catch (e) {
                      const message =
                        e instanceof Error ? e.message : "PayPal capture failed";
                      setError(message);
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
