export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(
  amount: number,
  currency = "USD",
  locale = "en-US",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** PayPal expects amounts as fixed-2 strings. */
export function toPayPalAmount(n: number): string {
  return round2(n).toFixed(2);
}

export function currency(): string {
  return process.env.PAYPAL_CURRENCY || "USD";
}
