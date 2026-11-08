"use client";

import { useEffect, useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  api,
  type CaptureSettlementResponse,
  type GroupDetailDTO,
  type PayPalSettlementResponse,
  type StatusDTO,
  type SuggestedRepayment,
} from "@/lib/client";
import { fromCents, toCents } from "@/lib/group";
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
  const [paymentAmount, setPaymentAmount] = useState("");
  useEffect(() => {
    setPaymentAmount(repayment ? fromCents(repayment.amountCents).toFixed(2) : "");
    setError(null);
    setDone(null);
    settlementIdRef.current = null;
  }, [repayment]);
  const paymentCents = toCents(Number(paymentAmount));
  const validAmount = Boolean(repayment && /^\d+(\.\d{1,2})?$/.test(paymentAmount) && paymentCents > 0 && paymentCents <= repayment.amountCents);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CaptureSettlementResponse | null>(null);
  // PayPalButtons callbacks can outlive a render, so keep the server id in a ref.
  const settlementIdRef = useRef<string | null>(null);

  const sender = group.members.find((member) => member.id === repayment?.fromMemberId);
  const recipient = group.members.find((member) => member.id === repayment?.toMemberId);

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
          <div className="mb-4 rounded-xl border border-paper-line">
            <div className="flex items-center justify-between border-b border-paper-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <span>{group.name}</span>
              <span>PayPal Sandbox</span>
            </div>
            <dl className="divide-y divide-paper-line text-sm">
              <div className="flex items-center justify-between px-4 py-2">
                <dt className="text-ink-muted">From</dt>
                <dd className="text-right">
                  <div>{repayment.fromName}</div>
                  <div className="text-xs text-ink-muted">{sender?.paypalAddress || "PayPal email required"}</div>
                </dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2">
                <dt className="text-ink-muted">To</dt>
                <dd className="text-right">
                  <div>{repayment.toName}</div>
                  <div className="text-xs text-ink-muted">{recipient?.paypalAddress || "PayPal email required"}</div>
                </dd>
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
              {done.captureId ? ` · capture ${done.captureId}` : ""}. {done.status === "SETTLED" ? "The repayment is now marked settled." : "The payment is not settled yet."}
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
              <p className="text-sm text-ink-muted">
                Log in to the sender’s PayPal account to pay the recipient shown above. No shipping address is needed. The settlement is recorded only after PayPal confirms the capture.
              </p>
              <label className="block text-sm text-ink-soft">
                Amount to pay ({group.currency})
                <input className="input mt-1" type="number" min="0.01" step="0.01"
                  max={fromCents(repayment.amountCents)} value={paymentAmount} disabled={busy}
                  onChange={(event) => setPaymentAmount(event.target.value)} />
              </label>
              <p className="text-xs text-ink-muted">Pay the full amount or part of it. Any remaining debt stays visible.</p>
              {!validAmount && <Alert>Enter an amount between 0.01 and {fromCents(repayment.amountCents).toFixed(2)}.</Alert>}
              <PayPalScriptProvider
                options={{ clientId, currency: group.currency, intent: "capture" }}
              >
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect" }}
                  disabled={busy || !validAmount}
                  forceReRender={[paymentCents]}
                  createOrder={async () => {
                    if (!validAmount) throw new Error("Enter a valid payment amount");
                    setError(null);
                    setBusy(true);
                    try {
                      const order = await api.post<PayPalSettlementResponse>(
                        `/api/groups/${group.id}/settlements/paypal`,
                        {
                          senderId: repayment.fromMemberId,
                          recipientId: repayment.toMemberId,
                          amountCents: paymentCents,
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
                <p className="flex items-center gap-2 text-sm text-ink-muted">
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
