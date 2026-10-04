import test from "node:test";
import assert from "node:assert/strict";
import {
  createReceiptAccessToken,
  orderReceiptCode,
  verifyReceiptAccessToken
} from "../lib/receipt-access.ts";

test("receipt access tokens bind order and Telegram user", () => {
  const before = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "123456:test-only-secret";
  try {
    const token = createReceiptAccessToken({
      orderId: "11111111-2222-3333-4444-555555555555",
      telegramUserId: 42,
      ttlSeconds: 600
    });
    const payload = verifyReceiptAccessToken(token);
    assert.equal(payload.orderId, "11111111-2222-3333-4444-555555555555");
    assert.equal(payload.telegramUserId, 42);
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));
    assert.throws(() => verifyReceiptAccessToken(`${token}x`), /Invalid receipt link/);
  } finally {
    if (before === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = before;
  }
});

test("receipt codes are stable and human readable", () => {
  assert.equal(
    orderReceiptCode("abcdef12-3456-7890-abcd-ef1234567890", "2026-10-04T05:00:00.000Z"),
    "MRM-20261004-ABCDEF12"
  );
});
