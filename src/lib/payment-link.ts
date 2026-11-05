import { fromCents } from "./group";

/**
 * Build a shareable PayPal payment link for a group repayment.
 *
 * Members can enter either a PayPal email address or a PayPal.Me handle. The
 * email form uses PayPal's donate flow (which accepts a business email and a
 * preset amount); the handle form uses the shorter paypal.me amount URL.
 */
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

  if (value.includes("@")) {
    const params = new URLSearchParams({
      business: value,
      currency_code: currency,
      amount,
      item_name: "Group repayment",
    });
    return `https://www.paypal.com/donate/?${params.toString()}`;
  }

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
