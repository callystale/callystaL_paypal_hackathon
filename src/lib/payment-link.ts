import { fromCents } from "./group";

/** Build PayPal.Me links only. Email recipients must use server-created checkout. */
export function paypalPaymentLink(
  address: string | null | undefined,
  amountCents: number,
  currency: string,
): string | null {
  const value = address?.trim().replace(/^@/, "") ?? "";
  if (!value) return null;

  // A member may paste a complete PayPal.Me / invoice URL. Keep it intact
  // rather than trying to rewrite something we do not understand.
  if (/^https?:\/\//i.test(value)) return value;

  const amount = fromCents(amountCents).toFixed(2);

  // An email is not a PayPal.Me handle. Never route repayments through donations.
  if (value.includes("@")) return null;

  const handle = value
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, "")
    .replace(/^paypal\.me\//i, "")
    .replace(/^\/+|\/+$/g, "");
  if (!handle) return null;

  return `https://www.paypal.com/paypalme/${encodeURIComponent(handle)}/${amount}${currency}`;
}

/** Human-readable label for a stored payer reference. */
export function settlementReferenceLabel(reference: string | null): string | null {
  if (!reference) return null;
  if (reference === "payment-link") return "PayPal link request";
  if (reference === "paypal-link-confirmed") return "PayPal link confirmed";
  if (reference === "manual") return "Marked manually";
  return reference;
}
