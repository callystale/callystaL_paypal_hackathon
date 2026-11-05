"use client";

import { useState } from "react";
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

  if (!repayment) return null;

  const recipient = group.members.find(
    (member) => member.id === repayment.toMemberId,
  );
  const link = paypalPaymentLink(
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
        <div className="rounded-xl border border-slate-700">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-800 bg-white p-4">
              <QRCodeSVG
                value={link}
                size={184}
                bgColor="#ffffff"
                fgColor="#0f172a"
                includeMargin
                aria-label={`Payment QR code for ${repayment.toName}`}
              />
              <p className="text-center text-[11px] text-slate-600">
                Scan with a PayPal app or phone camera
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                Payment link for {recipient?.displayName ?? repayment.toName}
              </p>
              <p className="break-all text-xs text-sky-300">{link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm text-xs" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  className="btn-secondary btn-sm text-xs"
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PayPal ↗
                </a>
              </div>
            </div>
          </>
        ) : (
          <Alert>
            Add a PayPal email or PayPal.Me handle for {recipient?.displayName ?? "the recipient"}{" "}
            first. Open the member editor in the group roster to add it.
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs">
          <span className={pending ? "text-amber-300" : "text-slate-400"}>
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
            <button
              className="btn-primary btn-sm text-xs"
              disabled={marking || deleting}
              onClick={() => {
                void onMarkPaid(pending).then((ok) => {
                  if (ok) close();
                });
              }}
            >
              {marking ? <Spinner /> : null} Mark as paid
            </button>
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

        <p className="text-[11px] leading-relaxed text-slate-500">
          A link or QR code sends the payer to the recipient&apos;s PayPal. The group
          balance only changes after you mark the request paid (or after an in-app
          PayPal capture is confirmed).
        </p>
      </div>
    </Modal>
  );
}
