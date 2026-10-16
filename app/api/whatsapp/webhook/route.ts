import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyWhatsAppSignature } from "@/lib/whatsapp-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function constantTimeMatch(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

/** GET verification handshake — paste the same verify token into Meta's webhook UI. */
export function GET(request: NextRequest) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) return new NextResponse("Unconfigured", { status: 503, headers: NO_STORE });
  const query = request.nextUrl.searchParams;
  if (query.get("hub.mode") !== "subscribe" ||
      !constantTimeMatch(query.get("hub.verify_token") || "", token)) {
    return new NextResponse("Forbidden", { status: 403, headers: NO_STORE });
  }
  const challenge = query.get("hub.challenge");
  if (!challenge || !/^\d{1,32}$/.test(challenge)) {
    return new NextResponse("Bad challenge", { status: 400, headers: NO_STORE });
  }
  return new NextResponse(challenge, { status: 200, headers: { ...NO_STORE, "Content-Type": "text/plain" } });
}

/**
 * Secure receipt-only scaffold: signature verification is live, but NO incoming
 * messages are persisted or answered. Do not enable a public business number
 * until durable deduplication, consent-aware messaging and handoff are added.
 */
export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ ok: false, error: "unconfigured" }, { status: 503, headers: NO_STORE });
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  }
  let event: unknown;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE }); }
  if (!event || typeof event !== "object" || (event as {object?: unknown}).object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }
  // ACK validation only. Do not log phone numbers or body content in Vercel logs.
  // No customer-facing automation is active in this draft implementation.
  return NextResponse.json({ ok: true, processing: "disabled" }, { headers: NO_STORE });
}
