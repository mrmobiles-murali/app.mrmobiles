import crypto from "node:crypto";

export type ReceiptAccessPayload = {
  v: 1;
  orderId: string;
  telegramUserId: number;
  exp: number;
};

function receiptSecret() {
  const secret = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret) throw new Error("Receipt signing is unavailable.");
  return secret.trim();
}

function sign(encoded: string) {
  return crypto.createHmac("sha256", receiptSecret()).update(encoded).digest("base64url");
}

export function orderReceiptCode(id: string, createdAt: string) {
  const date = new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? "ORDER"
    : date.toISOString().slice(0, 10).replaceAll("-", "");
  return `MRM-${stamp}-${String(id).slice(0, 8).toUpperCase()}`;
}

export function createReceiptAccessToken(input: {
  orderId: string;
  telegramUserId: number;
  ttlSeconds?: number;
}) {
  const orderId = String(input.orderId || "").trim();
  if (!orderId || !Number.isSafeInteger(input.telegramUserId) || input.telegramUserId <= 0) {
    throw new Error("Invalid receipt access request.");
  }

  const ttlSeconds = Math.max(60, Math.min(30 * 24 * 60 * 60, input.ttlSeconds ?? 7 * 24 * 60 * 60));
  const payload: ReceiptAccessPayload = {
    v: 1,
    orderId,
    telegramUserId: input.telegramUserId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyReceiptAccessToken(token: string): ReceiptAccessPayload {
  const [encoded, receivedSignature, extra] = String(token || "").split(".");
  if (!encoded || !receivedSignature || extra !== undefined) {
    throw new Error("Invalid receipt link.");
  }

  const expected = sign(encoded);
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid receipt link.");
  }

  let payload: ReceiptAccessPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ReceiptAccessPayload;
  } catch {
    throw new Error("Invalid receipt link.");
  }

  if (
    payload?.v !== 1 ||
    typeof payload.orderId !== "string" ||
    !payload.orderId ||
    !Number.isSafeInteger(payload.telegramUserId) ||
    payload.telegramUserId <= 0 ||
    !Number.isFinite(payload.exp)
  ) {
    throw new Error("Invalid receipt link.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Receipt link expired. Reopen your Mr Mobiles account to get a fresh link.");
  }

  return payload;
}
