import crypto from "crypto";

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay API credentials are missing.");
  return { keyId, keySecret };
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, keySecret } = getCredentials();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {}
    }),
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.description || "Razorpay order creation failed.");
  }

  return {
    keyId,
    order: data as {
      id: string;
      amount: number;
      currency: string;
      status: string;
    }
  };
}

export function verifyPaymentSignature(input: {
  serverOrderId: string;
  paymentId: string;
  signature: string;
}) {
  const { keySecret } = getCredentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.serverOrderId}|${input.paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(input.signature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is missing.");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature || "", "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
