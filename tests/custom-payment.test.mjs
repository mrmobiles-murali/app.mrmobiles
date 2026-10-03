import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_PAYMENT_MAX_PAISE,
  CUSTOM_PAYMENT_MIN_PAISE,
  parseCustomPaymentAmount
} from "../lib/custom-payment.ts";

test("custom payment accepts ₹1 and decimal rupee values", () => {
  assert.equal(parseCustomPaymentAmount("1"), CUSTOM_PAYMENT_MIN_PAISE);
  assert.equal(parseCustomPaymentAmount("1.25"), 125);
  assert.equal(parseCustomPaymentAmount("10000"), CUSTOM_PAYMENT_MAX_PAISE);
});

test("custom payment rejects zero, excessive and malformed values", () => {
  assert.throws(() => parseCustomPaymentAmount("0"), /between ₹1 and ₹10,000/);
  assert.throws(() => parseCustomPaymentAmount("10000.01"), /between ₹1 and ₹10,000/);
  assert.throws(() => parseCustomPaymentAmount("1.234"), /valid custom amount/);
  assert.throws(() => parseCustomPaymentAmount("abc"), /valid custom amount/);
});
