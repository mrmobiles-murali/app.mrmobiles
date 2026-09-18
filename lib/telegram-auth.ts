import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export function validateTelegramInitData(
  initData: string,
  maxAgeSeconds = 3600
): { user: TelegramUser; authDate: number } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  if (!initData) throw new Error("Telegram initData is missing.");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("Telegram hash is missing.");

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(token)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculatedHash, "hex");
  const b = Buffer.from(receivedHash, "hex");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid Telegram initData signature.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) throw new Error("Invalid Telegram auth_date.");

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSeconds || authDate > now + 60) {
    throw new Error("Telegram session is expired.");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Telegram user is missing.");

  const user = JSON.parse(userRaw) as TelegramUser;
  if (!user?.id) throw new Error("Invalid Telegram user.");

  return { user, authDate };
}
