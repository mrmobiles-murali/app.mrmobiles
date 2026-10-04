import { createHash } from "node:crypto";

export const REPAIR_REFERENCE_RE = /^MRR-[A-F0-9]{10}$/;

export type RepairPaymentCartItem = {
  productId: string;
  name: string;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};

export function normalizeRepairReference(value: unknown): string | null {
  const reference = String(value || "").trim().toUpperCase();
  return REPAIR_REFERENCE_RE.test(reference) ? reference : null;
}

export function repairPaymentReservationId(
  telegramUserId: number,
  referenceCode: string,
  amountPaise: number
): string {
  const reference = normalizeRepairReference(referenceCode);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0 ||
      !reference || !Number.isSafeInteger(amountPaise) || amountPaise < 100) {
    throw new Error("Invalid repair payment reservation.");
  }

  const chars = createHash("sha256")
    .update(`repair-payment:${telegramUserId}:${reference}:${amountPaise}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  chars[12] = "5";
  chars[16] = "8";
  const hex = chars.join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function repairPaymentProductId(referenceCode: string) {
  const reference = normalizeRepairReference(referenceCode);
  if (!reference) throw new Error("Invalid repair reference.");
  return `repair:${reference}`;
}

export function createRepairPaymentCartItem(
  referenceCode: string,
  amountPaise: number,
  deviceLabel = "Repair service"
): RepairPaymentCartItem {
  const reference = normalizeRepairReference(referenceCode);
  if (!reference || !Number.isSafeInteger(amountPaise) || amountPaise < 100) {
    throw new Error("Invalid repair payment.");
  }

  const label = String(deviceLabel || "Repair service").trim().slice(0, 120) || "Repair service";
  return {
    productId: repairPaymentProductId(reference),
    name: `${label} · ${reference}`,
    qty: 1,
    unitPricePaise: amountPaise,
    lineTotalPaise: amountPaise
  };
}

export function repairReferenceFromCart(cart: unknown): string | null {
  if (!Array.isArray(cart)) return null;
  for (const item of cart) {
    const productId = typeof item?.productId === "string" ? item.productId : "";
    if (!productId.startsWith("repair:")) continue;
    const reference = normalizeRepairReference(productId.slice("repair:".length));
    if (reference) return reference;
  }
  return null;
}
