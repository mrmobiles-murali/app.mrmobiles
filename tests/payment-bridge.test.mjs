import test from "node:test";
import assert from "node:assert/strict";
import {
  createPaymentBridgeToken,
  verifyPaymentBridgeToken
} from "../lib/payment-bridge.ts";

test("payment bridge token is signed and bound to one order", { concurrency: false }, () => {
  const original = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "bridge_unit_secret";
  try {
    const token = createPaymentBridgeToken({
      internalOrderId: "internal-123",
      razorpayOrderId: "order_123",
      telegramUserId: 8624638243,
      ttlSeconds: 300
    });
    const payload = verifyPaymentBridgeToken(token);
    assert.equal(payload.internalOrderId, "internal-123");
    assert.equal(payload.razorpayOrderId, "order_123");
    assert.equal(payload.telegramUserId, 8624638243);

    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.throws(() => verifyPaymentBridgeToken(tampered), /Invalid payment bridge token/);
  } finally {
    if (original === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = original;
  }
});

test("payment bridge token expires", { concurrency: false }, () => {
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;
  const originalNow = Date.now;
  process.env.RAZORPAY_KEY_SECRET = "bridge_unit_secret";
  Date.now = () => 1_700_000_000_000;
  try {
    const token = createPaymentBridgeToken({
      internalOrderId: "internal-expired",
      razorpayOrderId: "order_expired",
      telegramUserId: 123,
      ttlSeconds: 60
    });
    Date.now = () => 1_700_000_061_000;
    assert.throws(() => verifyPaymentBridgeToken(token), /expired/);
  } finally {
    Date.now = originalNow;
    if (originalSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = originalSecret;
  }
});
