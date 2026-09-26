import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminIds, BOT_COMMANDS, BOT_WORKFLOW_VERSION, derivedWebhookSecret, handleBotUpdate, matchesSecret, miniAppUrl } from "@/lib/telegram-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settings(request: NextRequest) {
  const admins = adminIds(process.env.TELEGRAM_ADMIN_IDS);
  const candidate = process.env.TELEGRAM_SUPPORT_CHAT_ID;
  const supportChatId = candidate && /^-?\d+$/.test(candidate) ? Number(candidate) : admins[0];
  return {
    appUrl: miniAppUrl(request.url, process.env.TELEGRAM_MINI_APP_URL),
    admins,
    supportChatId: Number.isSafeInteger(supportChatId) && supportChatId !== 0 ? supportChatId : undefined
  };
}
function status(request: NextRequest) {
  const config = settings(request);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return {
    ok: true, workflowVersion: BOT_WORKFLOW_VERSION,
    botConfigured: Boolean(token), botId: token ? Number(token.split(":")[0]) : null,
    databaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    supportConfigured: Boolean(config.supportChatId && config.admins.length),
    miniAppUrl: config.appUrl, commands: BOT_COMMANDS
  };
}
export function GET(request: NextRequest) {
  try {
    return NextResponse.json(status(request), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Bot URL configuration is invalid." }, { status: 503 });
  }
}
class TelegramError extends Error {
  code: number;
  constructor(code: number) { super(`Telegram API failed (${code}).`); this.code = code; }
}
export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: false }, { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || derivedWebhookSecret(token);
  if (!matchesSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: unknown;
  try { update = await request.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  try {
    // Signed diagnostic: it cannot send a Telegram message.
    if ((update as any)?.mr_mobiles_probe === true && !(update as any)?.message) {
      return NextResponse.json(status(request));
    }
    await handleBotUpdate(update, {
      ...settings(request),
      async call(method, body) {
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(12000)
        });
        const data = await response.json();
        if (!response.ok || data?.ok !== true) throw new TelegramError(Number(data?.error_code || response.status));
        return data.result;
      },
      async orders(userId) {
        const { data, error } = await getSupabaseAdmin().from("orders")
          .select("id, amount_paise, status, workflow_status, created_at")
          .eq("telegram_user_id", userId).order("created_at", { ascending: false }).limit(5);
        if (error) throw new Error("Order lookup failed.");
        return data || [];
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Fetch exceptions can contain the bot token in their URLs: never log them.
    const code = error instanceof TelegramError ? error.code : 0;
    console.error("Telegram workflow request failed", { code });
    if (code === 400 || code === 403) return NextResponse.json({ ok: true, deliveryFailed: true });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
