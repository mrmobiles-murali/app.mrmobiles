import test from "node:test";
import assert from "node:assert/strict";
import { captureRazorpayPayment } from "../lib/razorpay.ts";

test("captureRazorpayPayment captures the trusted order amount on the server", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

  process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
  process.env.RAZORPAY_KEY_SECRET = "unit_secret";

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.razorpay.com/v1/payments/pay_unit_123/capture");
    assert.equal(init?.method, "POST");
    assert.match(String(init?.headers?.Authorization || ""), /^Basic /);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      amount: 49900,
      currency: "INR"
    });

    return {
      ok: true,
      json: async () => ({
        id: "pay_unit_123",
        amount: 49900,
        currency: "INR",
        status: "captured",
        captured: true,
        order_id: "order_unit_123"
      })
    };
  };

  try {
    const payment = await captureRazorpayPayment({
      paymentId: "pay_unit_123",
      amountPaise: 49900,
      currency: "inr"
    });
    assert.equal(payment.status, "captured");
    assert.equal(payment.captured, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = originalKeyId;
    if (originalKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  }
});
