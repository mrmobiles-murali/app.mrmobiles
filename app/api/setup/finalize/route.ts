import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const SETUP_KEY = "mm-finalize-2026-09-18-k9Q4x7";
const MINI_APP_URL = "https://appmrmobiles.vercel.app";
const WEBHOOK_URL = "https://appmrmobiles.vercel.app/api/telegram/webhook";

function telegramWebhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

async function telegram(method: string, body?: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) {
    throw new Error(`${method}: ${data?.description || "Telegram API error"}`);
  }
  return data.result;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("key") !== SETUP_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const me = await telegram("getMe");

    await telegram("setMyName", { name: "Mr Mobiles" });
    await telegram("setMyShortDescription", {
      short_description: "Phones • Accessories • Repairs • Secure orders inside Telegram"
    });
    await telegram("setMyDescription", {
      description:
        "Welcome to Mr Mobiles. Browse phones and accessories, book repair services, and manage your orders directly inside Telegram."
    });
    await telegram("setMyCommands", {
      commands: [
        { command: "start", description: "Open Mr Mobiles" },
        { command: "shop", description: "Browse phones & accessories" },
        { command: "repair", description: "Book a repair service" },
        { command: "orders", description: "View your orders" },
        { command: "support", description: "Contact Mr Mobiles support" }
      ]
    });
    await telegram("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Open Mr Mobiles",
        web_app: { url: MINI_APP_URL }
      }
    });
    await telegram("setWebhook", {
      url: WEBHOOK_URL,
      secret_token: telegramWebhookSecret(),
      allowed_updates: ["message"],
      drop_pending_updates: false
    });

    const webhookInfo = await telegram("getWebhookInfo");

    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    if (error) throw new Error(`Supabase: ${error.message}`);

    return NextResponse.json({
      ok: true,
      telegram: {
        id: me.id,
        username: me.username,
        webhookSet: webhookInfo?.url === WEBHOOK_URL,
        pendingUpdateCount: webhookInfo?.pending_update_count ?? 0
      },
      miniAppUrl: MINI_APP_URL,
      supabase: { ordersTable: true, currentOrderCount: count ?? 0 }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}
