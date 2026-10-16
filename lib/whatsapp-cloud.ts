import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify Meta's HMAC over the ORIGINAL UTF-8 request body. */
export function verifyWhatsAppSignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret || !header || !/^sha256=[a-fA-F0-9]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Server-side only. Send within an open service window or use an approved template. */
export async function sendWhatsAppText(to: string, body: string): Promise<unknown> {
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!version || !/^v\d+\.\d+$/.test(version) || !phoneId || !/^\d+$/.test(phoneId) || !accessToken) {
    throw new Error("WhatsApp Cloud API configuration is incomplete.");
  }
  if (!/^\d{8,15}$/.test(to) || !body.trim() || body.length > 4096) {
    throw new Error("Invalid WhatsApp message destination or body.");
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`WhatsApp send failed (HTTP ${response.status}).`);
  return response.json();
}
