import { NextRequest, NextResponse } from "next/server";
import { answerBusinessQuestion, aiRuntimeConfigured } from "@/lib/business-ai";
import { getInventoryProductsByIds, searchInventoryProducts } from "@/lib/server-catalog";
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
  const customSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  return {
    ok: true, workflowVersion: BOT_WORKFLOW_VERSION,
    botConfigured: Boolean(token), botId: token ? Number(token.split(":")[0]) : null,
    // Configuration metadata only: never expose credentials or their hashes.
    webhookAuthMode: customSecret ? "custom_secret" : "derived_token",
    botTokenHasWhitespace: Boolean(token && token !== token.trim()),
    webhookSecretHasWhitespace: Boolean(customSecret && customSecret !== customSecret.trim()),
    deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    databaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    supportConfigured: Boolean(config.supportChatId && config.admins.length),
    inlineHandlerConfigured: true,
    callbackHandlerConfigured: true,
    aiConfigured: aiRuntimeConfigured(),
    aiGateway: "vercel",
    aiModel: process.env.MR_MOBILES_AI_MODEL || "openai/gpt-5.6-luna",
    aiConversationMemory: true,
    liveDraftStreaming: true,
    compareActions: true,
    feedbackConfigured: true,
    repairIntakeRouting: true,
    inventorySource: "supabase",
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

    // Self-heal the Telegram webhook subscription after a signed /start update.
    // This is idempotent, preserves pending updates and never exposes the bot token.
    const incomingText = typeof (update as any)?.message?.text === "string"
      ? (update as any).message.text.trim()
      : "";
    const incomingCommand = incomingText.split(/\s+/)[0]?.split("@")[0]?.toLowerCase();
    if (incomingCommand === "/start") {
      const webhookUrl = new URL(request.url);
      webhookUrl.search = "";
      webhookUrl.hash = "";
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl.toString(),
          secret_token: secret,
          allowed_updates: ["message", "inline_query", "callback_query"],
          max_connections: 5,
          drop_pending_updates: false
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        throw new TelegramError(Number(data?.error_code || response.status));
      }
    }

    const callTelegram = async (method: string, body: Record<string, unknown>) => {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(12000)
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) throw new TelegramError(Number(data?.error_code || response.status));
      return data.result;
    };

    let botUsername: string | undefined;
    if ((update as any)?.inline_query) {
      const me = await callTelegram("getMe", {}) as any;
      if (typeof me?.username === "string") botUsername = me.username;
    }

    const config = settings(request);

    await handleBotUpdate(update, {
      ...config,
      botUsername,
      call: callTelegram,
      aiReply: answerBusinessQuestion,
      async handoff(userId, name) {
        if (!config.supportChatId || !config.admins.length) return false;
        try {
          await callTelegram("sendMessage", {
            chat_id: config.supportChatId,
            text: [
              "👤 Human support requested",
              `Name: ${name}`,
              `Customer ID: ${userId}`,
              "",
              "Reply in your private chat with the bot:",
              `/reply ${userId} your message`
            ].join("\n")
          });
          return true;
        } catch {
          return false;
        }
      },
      async repairIntake(userId, name, details) {
        if (!config.supportChatId || !config.admins.length) return false;
        try {
          await callTelegram("sendMessage", {
            chat_id: config.supportChatId,
            text: [
              "🛠 Repair diagnosis request",
              `Name: ${name}`,
              `Customer ID: ${userId}`,
              "",
              details,
              "",
              "Reply in your private chat with the bot:",
              `/reply ${userId} your message`
            ].join("\n")
          });
          return true;
        } catch {
          return false;
        }
      },
      async orders(userId) {
        const { data, error } = await getSupabaseAdmin().from("orders")
          .select("id, amount_paise, status, workflow_status, created_at")
          .eq("telegram_user_id", userId).order("created_at", { ascending: false }).limit(5);
        if (error) throw new Error("Order lookup failed.");
        return data || [];
      },
      async searchProducts(query) {
        return searchInventoryProducts(query);
      },
      async productsByIds(ids) {
        return getInventoryProductsByIds(ids);
      },
      async feedback(userId, responseId, rating) {
        const { error } = await getSupabaseAdmin()
          .from("ai_feedback")
          .upsert({
            assistant_message_id: responseId,
            telegram_user_id: userId,
            rating,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "assistant_message_id,telegram_user_id"
          });
        return !error;
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
