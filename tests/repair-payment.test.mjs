import test from "node:test";
import assert from "node:assert/strict";
import {
  createRepairPaymentCartItem,
  normalizeRepairReference,
  repairReferenceFromCart
} from "../lib/repair-payment.ts";

test("repair payment references are normalized and validated", () => {
  assert.equal(normalizeRepairReference("mrr-a1b2c3d4e5"), "MRR-A1B2C3D4E5");
  assert.equal(normalizeRepairReference("bad-ref"), null);
});

test("repair payment cart item binds the exact quote and reference", () => {
  const item = createRepairPaymentCartItem("MRR-A1B2C3D4E5", 250000, "Samsung S23");
  assert.equal(item.productId, "repair:MRR-A1B2C3D4E5");
  assert.equal(item.unitPricePaise, 250000);
  assert.equal(item.lineTotalPaise, 250000);
  assert.equal(repairReferenceFromCart([item]), "MRR-A1B2C3D4E5");
});

test("repair reference parser ignores unrelated cart items", () => {
  assert.equal(repairReferenceFromCart([{ productId: "custom-payment" }]), null);
});
