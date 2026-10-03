export const CUSTOM_PAYMENT_MIN_PAISE = 100;
export const CUSTOM_PAYMENT_MAX_PAISE = 1_000_000;

export function parseCustomPaymentAmount(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Enter a valid custom amount between ₹1 and ₹10,000.");
  }

  const [rupeesPart, paisePart = ""] = raw.split(".");
  const paise = Number(rupeesPart) * 100 + Number((paisePart + "00").slice(0, 2));

  if (
    !Number.isSafeInteger(paise) ||
    paise < CUSTOM_PAYMENT_MIN_PAISE ||
    paise > CUSTOM_PAYMENT_MAX_PAISE
  ) {
    throw new Error("Custom payment must be between ₹1 and ₹10,000.");
  }

  return paise;
}
