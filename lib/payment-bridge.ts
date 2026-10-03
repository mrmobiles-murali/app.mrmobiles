import crypto from "crypto";

type PaymentBridgePayload = {
  v: 1;
  internalOrderId: string;
  razorpayOrderId: string;
  telegramUserId: number;
  exp: number;
};

function bridgeSecret() {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("Razorpay API credentials are missing.");
  return secret;
}

function sign(encoded: string) {
  return crypto.createHmac("sha256", bridgeSecret()).update(encoded).digest("base64url");
}

export function createPaymentBridgeToken(input: {
  internalOrderId: string;
  razorpayOrderId: string;
  telegramUserId: number;
  ttlSeconds?: number;
}) {
  const ttlSeconds = Math.max(60, Math.min(30 * 60, input.ttlSeconds ?? 15 * 60));
  const payload: PaymentBridgePayload = {
    v: 1,
    internalOrderId: input.internalOrderId,
    razorpayOrderId: input.razorpayOrderId,
    telegramUserId: input.telegramUserId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyPaymentBridgeToken(token: string): PaymentBridgePayload {
  const [encoded, receivedSignature, extra] = String(token || "").split(".");
  if (!encoded || !receivedSignature || extra !== undefined) {
    throw new Error("Invalid payment bridge token.");
  }

  const expectedSignature = sign(encoded);
  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(receivedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid payment bridge token.");
  }

  let payload: PaymentBridgePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PaymentBridgePayload;
  } catch {
    throw new Error("Invalid payment bridge token.");
  }

  if (
    payload?.v !== 1 ||
    typeof payload.internalOrderId !== "string" ||
    !payload.internalOrderId ||
    typeof payload.razorpayOrderId !== "string" ||
    !payload.razorpayOrderId ||
    !Number.isSafeInteger(payload.telegramUserId) ||
    payload.telegramUserId <= 0 ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error("Invalid payment bridge token.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Payment session expired. Reopen Mr Mobiles and try again.");
  }

  return payload;
}
