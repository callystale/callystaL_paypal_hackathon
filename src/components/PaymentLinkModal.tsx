"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type {
  GroupDetailDTO,
  SettlementDTO,
  SuggestedRepayment,
} from "@/lib/client";
import { fromCents } from "@/lib/group";
import { paypalPaymentLink, settlementReferenceLabel } from "@/lib/payment-link";
import { Alert, DebtArrow, Modal, Money, Spinner } from "./ui";

export function PaymentLinkModal({
  group,
  repayment,
  busy,
  onClose,
  onMarkPaid,
  onDeleteRequest,
}: {
  group: GroupDetailDTO;
  repayment: SuggestedRepayment | null;
  busy: string | null;
  onClose: () => void;
  onMarkPaid: (settlement: SettlementDTO) => Promise<boolean>;
  onDeleteRequest: (settlement: SettlementDTO) => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const qrContainer = useRef<HTMLDivElement>(null);
  useEffect(() => { setOrigin(process.env.NEXT_PUBLIC_APP_URL || window.location.origin); }, []);

  if (!repayment) return null;

  const recipient = group.members.find(
    (member) => member.id === repayment.toMemberId,
  );
  const paypalLink = paypalPaymentLink(
    recipient?.paypalAddress,
    repayment.amountCents,
    group.currency,
  );
  const pending = group.settlements.find(
    (settlement) =>
      settlement.status === "PENDING" &&
      settlement.senderId === repayment.fromMemberId &&
      settlement.recipientId === repayment.toMemberId &&
      settlement.amountCents === repayment.amountCents,
  );

  const sharedCheckout = Boolean(recipient?.paypalAddress?.includes("@"));
  const link = sharedCheckout
    ? pending && origin ? `${origin.replace(/\/$/, "")}/pay/${encodeURIComponent(pending.id)}` : null
    : paypalLink;
  const downloadQR = () => {
    const svg = qrContainer.current?.querySelector("svg");
    if (!svg) return;
    const picture = new Image();
    picture.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 736;
      canvas.getContext("2d")?.drawImage(picture, 0, 0, 736, 736);
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = "repayment-qr.png";
      anchor.click();
    };
    picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const marking = pending ? busy === `settlement-pay-${pending.id}` : false;
  const deleting = pending ? busy === `settlement-delete-${pending.id}` : false;

  return (
    <Modal open={Boolean(repayment)} onClose={close} title="Payment link & QR">
      <div className="space-y-4">
        <div className="rounded-xl border border-paper-line">
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <span>{group.name}</span>
            <span>{group.currency}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium">{repayment.fromName}</p>
              <p className="text-[11px] text-rose-300">owes</p>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold text-amber-300">
                <Money
                  amount={fromCents(repayment.amountCents)}
                  currency={group.currency}
                />
              </span>
              <DebtArrow className="my-0.5 h-4 w-16" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{repayment.toName}</p>
              <p className="text-[11px] text-emerald-300">is owed</p>
            </div>
          </div>
        </div>

        {link ? (
          <>
            <div ref={qrContainer} className="flex flex-col items-center gap-3 rounded-xl border border-paper-line bg-white p-4">
              <QRCodeSVG
                value={link}
                size={184}
                bgColor="#ffffff"
                fgColor="#0f172a"
                includeMargin
                aria-label={`Payment QR code for ${repayment.toName}`}
              />
              <p className="text-center text-[11px] text-ink-soft">
                Scan with a phone camera to open the payment request
              </p>
            </div>

            <div className="rounded-lg border border-paper-line bg-paper-base/50 p-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
                Payment link for {recipient?.displayName ?? repayment.toName}
              </p>
              <p className="break-all text-xs text-sky-300">{link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm text-xs" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button className="btn-secondary btn-sm text-xs" onClick={downloadQR}>Download QR</button>
                <a
                  className="btn-secondary btn-sm text-xs"
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {sharedCheckout ? "Open payment request ↗" : "Open PayPal ↗"}
                </a>
              </div>
            </div>
          </>
        ) : (
          <Alert>
            {sharedCheckout
              ? "This payment request is no longer pending. Close this window to check the updated balance."
              : `Add a PayPal.Me handle for ${recipient?.displayName ?? "the recipient"} to share a link.`}
          </Alert>
        )}

        {sharedCheckout && /localhost|127\.0\.0\.1/.test(origin) && (
          <Alert>To scan from another device, open this app using a reachable network or deployed URL before sharing the QR. A localhost link only works on this computer.</Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-line px-3 py-2 text-xs">
          <span className={pending ? "text-amber-300" : "text-ink-muted"}>
            {pending
              ? `Requested · waiting for payment${
                  pending.paymentReference
                    ? ` · ${settlementReferenceLabel(pending.paymentReference)}`
                    : ""
                }`
              : "Link ready · no request recorded yet"}
          </span>
          {pending && (
            <span className="badge bg-amber-500/15 text-amber-300">pending</span>
          )}
        </div>

        {pending && (
          <div className="flex flex-wrap gap-2">
            {!sharedCheckout && <button
              className="btn-primary btn-sm text-xs"
              disabled={marking || deleting}
              onClick={() => {
                void onMarkPaid(pending).then((ok) => {
                  if (ok) close();
                });
              }}
            >
              {marking ? <Spinner /> : null} Mark as paid
            </button>}
            <button
              className="btn-ghost btn-sm text-xs"
              disabled={marking || deleting}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this payment request? The repayment will stay unpaid.",
                  )
                ) {
                  void onDeleteRequest(pending).then((ok) => {
                    if (ok) close();
                  });
                }
              }}
            >
              {deleting ? <Spinner /> : null} Delete request
            </button>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-ink-muted">
          {sharedCheckout
            ? `Send this QR code or link to ${repayment.fromName}. They review the recipient and sign in to their own PayPal account. Balances update after PayPal confirms payment.`
            : "The balance changes after you confirm payment or PayPal capture is confirmed."}
        </p>
      </div>
    </Modal>
  );
}
