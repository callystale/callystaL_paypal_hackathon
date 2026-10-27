import { toPayPalAmount } from "./money";

const PAYPAL_ENV = process.env.PAYPAL_ENV || "sandbox";

function apiBase(): string {
  return PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function paypalClientId(): string {
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!paypalConfigured()) {
    throw new Error("PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export interface OrderLine {
  name: string;
  amount: number;
}

export interface CreateOrderInput {
  amount: number;
  currency: string;
  description: string;
  referenceId?: string;
  lines?: OrderLine[];
}

export interface PayPalOrder {
  id: string;
  status: string;
}

export async function createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
  const token = await getAccessToken();

  const items = (input.lines ?? []).map((line) => ({
    name: line.name.slice(0, 127),
    quantity: "1",
    unit_amount: {
      currency_code: input.currency,
      value: toPayPalAmount(line.amount),
    },
  }));

  const purchaseUnit: Record<string, unknown> = {
    description: input.description.slice(0, 127),
    amount: {
      currency_code: input.currency,
      value: toPayPalAmount(input.amount),
      ...(items.length
        ? {
            breakdown: {
              item_total: {
                currency_code: input.currency,
                value: toPayPalAmount(input.amount),
              },
            },
          }
        : {}),
    },
  };
  if (input.referenceId) purchaseUnit.reference_id = input.referenceId.slice(0, 127);
  if (items.length) purchaseUnit.items = items;

  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [purchaseUnit],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`PayPal create order failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as PayPalOrder;
}

export interface CaptureResult {
  id: string;
  status: string;
  captureId?: string;
  payerName?: string;
}

interface CaptureResponse {
  id: string;
  status: string;
  payer?: { name?: { given_name?: string; surname?: string } };
  purchase_units?: Array<{
    payments?: { captures?: Array<{ id?: string; status?: string }> };
  }>;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: Array<{ issue?: string; description?: string }>;
}

/** Issues that are safe to retry (usually an approval-propagation race). */
const RETRYABLE_ISSUES = new Set([
  "ORDER_NOT_APPROVED",
  "TRANSACTION_REFUSED",
  "TRY_AGAIN_LATER",
  "INTERNAL_SERVER_ERROR",
]);

/** User-facing explanations for the issues PayPal is most likely to return. */
const FRIENDLY_ISSUES: Record<string, string> = {
  ORDER_NOT_APPROVED:
    "PayPal has not finished approving this order yet. Please try the payment again.",
  INSTRUMENT_DECLINED:
    "That payment method was declined. Please choose another funding source.",
  PAYER_ACTION_REQUIRED:
    "PayPal needs another action from you before this payment can complete.",
  TRANSACTION_REFUSED: "PayPal refused this transaction. Please try again.",
};

export class PayPalError extends Error {
  status: number;
  issue?: string;
  debugId?: string;
  retryable: boolean;

  constructor(
    message: string,
    opts: { status: number; issue?: string; debugId?: string; retryable: boolean },
  ) {
    super(message);
    this.name = "PayPalError";
    this.status = opts.status;
    this.issue = opts.issue;
    this.debugId = opts.debugId;
    this.retryable = opts.retryable;
  }
}

function parsePayPalError(status: number, body: string): PayPalError {
  let parsed: PayPalErrorBody | null = null;
  try {
    parsed = JSON.parse(body) as PayPalErrorBody;
  } catch {
    // PayPal sometimes returns plain text (or an empty body) on failures.
  }

  const issue = parsed?.details?.[0]?.issue;
  const detail = parsed?.details?.[0]?.description;
  const base = parsed?.message || detail || `PayPal request failed (${status})`;
  const friendly = issue ? FRIENDLY_ISSUES[issue] : undefined;
  const message = friendly
    ? `${friendly} [${issue}]`
    : issue && !base.includes(issue)
      ? `${base} [${issue}]`
      : base;

  return new PayPalError(message, {
    status,
    issue,
    debugId: parsed?.debug_id,
    retryable:
      status >= 500 || (issue ? RETRYABLE_ISSUES.has(issue) : false),
  });
}

function payerNameFrom(data: CaptureResponse): string | undefined {
  return data.payer?.name
    ? [data.payer.name.given_name, data.payer.name.surname].filter(Boolean).join(" ")
    : undefined;
}

function captureFrom(data: CaptureResponse): CaptureResult {
  return {
    id: data.id,
    status: data.status,
    captureId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
    payerName: payerNameFrom(data),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch an order that PayPal already captured, so retries stay idempotent. */
async function getCapturedOrder(
  orderId: string,
  token: string,
): Promise<CaptureResult> {
  const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw parsePayPalError(res.status, await res.text());
  }
  return captureFrom((await res.json()) as CaptureResponse);
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();
  const maxAttempts = 3;
  let lastError: PayPalError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      return captureFrom((await res.json()) as CaptureResponse);
    }

    const error = parsePayPalError(res.status, await res.text());

    // Another request (or a previous timed-out attempt) already captured it.
    if (error.issue === "ORDER_ALREADY_CAPTURED") {
      return getCapturedOrder(orderId, token);
    }

    lastError = error;
    if (!error.retryable || attempt === maxAttempts) break;

    // PayPal can briefly reject a capture while the approval is propagating.
    await sleep(400 * attempt);
  }

  throw lastError ?? new Error("PayPal capture failed");
}
