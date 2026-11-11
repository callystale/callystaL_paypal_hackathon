import assert from "node:assert/strict";
import test from "node:test";
import { createOrder, getOrderForCheckout } from "./paypal";

test("checkout distinguishes missing orders from transient PayPal failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalId = process.env.PAYPAL_CLIENT_ID;
  const originalSecret = process.env.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  let response = Response.json({ id: "order", status: "CREATED" });
  globalThis.fetch = async (url) => String(url).endsWith("/v1/oauth2/token")
    ? Response.json({ access_token: "test-token", expires_in: 300 }) : response.clone();
  try {
    assert.deepEqual(await getOrderForCheckout("order"), { id: "order", status: "CREATED" });
    response = Response.json({ details: [{ issue: "INVALID_RESOURCE_ID" }] }, { status: 404 });
    assert.equal(await getOrderForCheckout("order"), null);
    response = Response.json({ message: "Service unavailable" }, { status: 503 });
    await assert.rejects(getOrderForCheckout("order"), /Service unavailable/);
    response = Response.json({ message: "Not authorized" }, { status: 403 });
    await assert.rejects(getOrderForCheckout("order"), /Not authorized/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalSecret;
  }
});

test("repayment orders direct funds to the specified recipient", async () => {
  const originalFetch = globalThis.fetch;
  const originalId = process.env.PAYPAL_CLIENT_ID;
  const originalSecret = process.env.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  const orders: Record<string, unknown>[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/v1/oauth2/token")) {
      return Response.json({ access_token: "test-token", expires_in: 300 });
    }
    orders.push(JSON.parse(String(options?.body)));
    return Response.json({ id: "test-order", status: "CREATED" });
  };
  try {
    const base = { amount: 12.34, currency: "USD", description: "Repayment" };
    await createOrder({ ...base, payeeEmail: "friend@example.com", noShipping: true });
    await createOrder(base);
    const unit = (orders[0].purchase_units as Record<string, unknown>[])[0];
    assert.deepEqual(orders[0].payment_source, { paypal: { experience_context: { shipping_preference: "NO_SHIPPING" } } });
    assert.equal(orders[1].payment_source, undefined);
    assert.deepEqual(unit.payee, { email_address: "friend@example.com" });
    assert.deepEqual(unit.amount, { currency_code: "USD", value: "12.34" });
    assert.equal((orders[1].purchase_units as Record<string, unknown>[])[0].payee, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalSecret;
  }
});

test("capture verifies the server-reported payer before moving money", async () => {
  const { captureOrder, PayPalError } = await import("./paypal");
  const originalFetch = globalThis.fetch;
  const originalId = process.env.PAYPAL_CLIENT_ID;
  const originalSecret = process.env.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  let payer: string | undefined = "wrong@example.com";
  let captureStatus = "COMPLETED";
  let captureRequests = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 300 });
    if (options?.method === "POST") {
      captureRequests++;
      return Response.json({ id: "order", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "capture", status: captureStatus }] } }] });
    }
    return Response.json({ id: "order", status: "APPROVED", payer: { email_address: payer } });
  };
  try {
    await assert.rejects(captureOrder("order", "sender@example.com"), (error: unknown) => error instanceof PayPalError && error.issue === "PAYER_ACCOUNT_MISMATCH");
    assert.equal(captureRequests, 0);
    payer = undefined;
    await assert.rejects(captureOrder("order", "sender@example.com"));
    assert.equal(captureRequests, 0);
    payer = " Sender@Example.com ";
    assert.equal((await captureOrder("order", "sender@example.com")).status, "COMPLETED");
    assert.equal(captureRequests, 1);
    const expected = { payeeEmail: "recipient@example.com", amount: 10, currency: "USD" };
    await assert.rejects(captureOrder("order", "sender@example.com", expected), (error: unknown) => error instanceof PayPalError && error.issue === "PAYMENT_DETAILS_MISMATCH");
    assert.equal(captureRequests, 1);
    captureStatus = "PENDING";
    assert.equal((await captureOrder("order", "sender@example.com")).status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalId === undefined) delete process.env.PAYPAL_CLIENT_ID;
    else process.env.PAYPAL_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
    else process.env.PAYPAL_CLIENT_SECRET = originalSecret;
  }
});
