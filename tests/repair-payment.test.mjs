import test from "node:test";
import assert from "node:assert/strict";
import {
  createRepairPaymentCartItem,
  normalizeRepairReference,
  repairReferenceFromCart,
  repairPaymentReservationId
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


test("repair payment reservation id is stable per approved quote", () => {
  const first = repairPaymentReservationId(8624638243, "MRR-A1B2C3D4E5", 250000);
  const second = repairPaymentReservationId(8624638243, "mrr-a1b2c3d4e5", 250000);
  const changed = repairPaymentReservationId(8624638243, "MRR-A1B2C3D4E5", 260000);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, changed);
});
