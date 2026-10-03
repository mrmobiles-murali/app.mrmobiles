import { NextRequest, NextResponse } from "next/server";
import { answerBusinessQuestion, aiRuntimeConfigured } from "@/lib/business-ai";
import { getInventoryProductsByIds, searchInventoryProducts } from "@/lib/server-catalog";
import { approveRepairQuote, createTelegramRepairTicket, getTelegramRepairTicket, listTelegramRepairTickets, REPAIR_STATUSES, updateRepairTicket } from "@/lib/repair-tickets";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminIds, BOT_COMMANDS, BOT_WORKFLOW_VERSION, derivedWebhookSecret, handleBotUpdate, matchesSecret, miniAppUrl, versionedMiniAppUrl, repairRushGameUrl, isRepairRushUpdate, REPAIR_RUSH_SHORT_NAME, REPAIR_RUSH_BOT_USERNAME } from "@/lib/telegram-workflow";

const MINI_APP_URL = "https://mrmobiles.in";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settings(request: NextRequest) {
  const admins = adminIds(process.env.TELEGRAM_ADMIN_IDS);
  const candidate = process.env.TELEGRAM_SUPPORT_CHAT_ID;
  const supportChatId = candidate && /^-?\d+$/.test(candidate) ? Number(candidate) : admins[0];
  let gameUrl: string | undefined;
  try { gameUrl = repairRushGameUrl(process.env.REPAIR_RUSH_GAME_URL); }
  catch { /* An invalid optional game URL must not interrupt customer support. */ }
  return {
    appUrl: miniAppUrl(request.url, process.env.TELEGRAM_MINI_APP_URL),
    gameUrl,
    admins,
    supportChatId: Number.isSafeInteger(supportChatId) && supportChatId !== 0 ? supportChatId : undefined
  };
}

function repairAdminKeyboard(referenceCode: string, userId?: number) {
  const rows: Array<Array<Record<string, string>>> = [
    [
      { text: "🔎 Diagnosing", callback_data: `repair_admin:${referenceCode}:diagnosing` },
      { text: "💰 Send Quote", callback_data: `repair_quote_prompt:${referenceCode}` }
    ],
    [
      { text: "🔧 Repairing", callback_data: `repair_admin:${referenceCode}:repairing` },
      { text: "📦 Ready", callback_data: `repair_admin:${referenceCode}:ready` }
    ],
    [
      { text: "✅ Completed", callback_data: `repair_admin:${referenceCode}:completed` }
    ]
  ];

  if (Number.isSafeInteger(userId) && Number(userId) > 0) {
    rows.push([
      { text: "⚡ Default Reply", callback_data: `reply_default:${userId}` },
      { text: "✍️ Custom Reply", callback_data: `reply_customer:${userId}` }
    ]);
  }
  return { inline_keyboard: rows };
}

function repairCustomerStatusText(referenceCode: string, status: string, note?: string | null) {
  const messages: Record<string, [string, string]> = {
    received: ["🛠 Repair received", "Your device is in the Mr Mobiles repair queue."],
    reviewing: ["👀 Repair under review", "Our team is reviewing your repair request."],
    diagnosing: ["🔎 Diagnosis started", "A technician has started inspecting your device."],
    awaiting_approval: ["💰 Approval required", "Your repair quote is ready for approval."],
    approved: ["✅ Quote approved", "Your approval is recorded and the repair can proceed."],
    repairing: ["🔧 Repair in progress", "Work on your device has started."],
    ready: ["📦 Repair ready", "Your device is ready for pickup or delivery."],
    completed: ["✅ Repair completed", "Your repair ticket is completed. Thank you for choosing Mr Mobiles."],
    rejected: ["⛔ Repair declined", "This repair has been marked as declined."],
    cancelled: ["🚫 Repair cancelled", "This repair ticket has been cancelled."]
  };
  const [title, body] = messages[status] || ["🛠 Repair status updated", `Status: ${status}`];
  return [
    title,
    `Reference: ${referenceCode}`,
    body,
    note ? `Note: ${note}` : ""
  ].filter(Boolean).join("\n");
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
    gameConfigured: Boolean(config.gameUrl),
    gameShortName: REPAIR_RUSH_SHORT_NAME,
    gameBotUsername: REPAIR_RUSH_BOT_USERNAME,
    gameConfigurationInvalid: Boolean(process.env.REPAIR_RUSH_GAME_URL && !config.gameUrl),
    aiConfigured: aiRuntimeConfigured(),
    aiGateway: "vercel",
    aiModel: process.env.MR_MOBILES_AI_MODEL || "openai/gpt-5.6-luna",
    aiConversationMemory: true,
    liveDraftStreaming: true,
    compareActions: true,
    feedbackConfigured: true,
    repairIntakeRouting: true,
    repairTicketLifecycle: true,
    repairQuoteApproval: true,
    homeDashboard: true,
    paymentLifecycleNotifications: true,
    profileSelfHeal: true,
    adminRepairControls: true,
    repairLifecycleNotifications: true,
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
    if ((update as any)?.inline_query || isRepairRushUpdate(update)) {
      const me = await callTelegram("getMe", {}) as any;
      if (typeof me?.username === "string") botUsername = me.username;
    }

    const config = settings(request);
    // BotFather registered this game to @MrMobileDoctor_bot. Do not try to
    // launch it with another bot's token, even if an optional URL was set.
    if (isRepairRushUpdate(update) && botUsername?.toLowerCase() !== REPAIR_RUSH_BOT_USERNAME.toLowerCase()) {
      config.gameUrl = undefined;
    }

    if (incomingCommand === "/start") {
      try {
        await callTelegram("setMyName", { name: "Mr Mobiles" });
        await callTelegram("setMyDescription", {
          description: "AI shopping assistant for phones, live stock, repair tickets, orders, payments and Mr Mobiles support."
        });
        await callTelegram("setMyShortDescription", {
          short_description: "Mr Mobiles AI | Shop, repair, track and get support."
        });
        await callTelegram("setMyCommands", { commands: BOT_COMMANDS });
        await callTelegram("setChatMenuButton", {
          menu_button: {
            type: "web_app",
            text: "Open Mr Mobiles",
            web_app: { url: versionedMiniAppUrl(config.appUrl) }
          }
        });
      } catch {
        // Customer chat must continue even if Telegram profile synchronization is temporarily unavailable.
      }
    }

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
              `Customer ID: ${userId}`
            ].join("\n"),
            reply_markup: {
              inline_keyboard: [[
                { text: "⚡ Send Default Reply", callback_data: `reply_default:${userId}` },
                { text: "✍️ Custom Reply", callback_data: `reply_customer:${userId}` }
              ]]
            }
          });
          return true;
        } catch {
          return false;
        }
      },
      async repairIntake(userId, name, details) {
        try {
          const ticket = await createTelegramRepairTicket({
            telegramUserId: userId,
            customerName: name,
            details
          });

          if (config.supportChatId && config.admins.length) {
            try {
              await callTelegram("sendMessage", {
                chat_id: config.supportChatId,
                text: [
                  "🛠 New repair ticket",
                  `Reference: ${ticket.reference_code}`,
                  `Name: ${name}`,
                  `Customer ID: ${userId}`,
                  `Device: ${[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}`,
                  `Issue: ${ticket.issue_or_condition}`,
                  "",
                  "Tap an action below — customer ID and repair reference are already linked."
                ].join("\n"),
                reply_markup: repairAdminKeyboard(ticket.reference_code, userId)
              });
            } catch {
              // Ticket remains valid even if the admin notification is temporarily unavailable.
            }
          }

          return { referenceCode: ticket.reference_code };
        } catch {
          return null;
        }
      },
      async repairs(userId) {
        return listTelegramRepairTickets(userId);
      },
      async repairStatus(userId, referenceCode) {
        return getTelegramRepairTicket(userId, referenceCode);
      },
      async repairUpdate(referenceCode, status, note) {
        if (!REPAIR_STATUSES.includes(status as any)) return false;
        const ticket = await updateRepairTicket({
          referenceCode,
          status: status as any,
          note
        });
        if (!ticket) return false;

        if (ticket.telegram_user_id) {
          try {
            await callTelegram("sendMessage", {
              chat_id: Number(ticket.telegram_user_id),
              text: repairCustomerStatusText(ticket.reference_code, ticket.status, ticket.status_note),
              reply_markup: {
                inline_keyboard: [
                  [{ text: "📍 Track Repair", callback_data: `repair_status:${ticket.reference_code}` }],
                  [{ text: "👤 Talk to Human", callback_data: "human_support" }]
                ]
              }
            });
          } catch {
            // The database state is authoritative even if notification delivery fails.
          }
        }
        return true;
      },
      async repairQuote(referenceCode, amountPaise, note) {
        const ticket = await updateRepairTicket({
          referenceCode,
          status: "awaiting_approval",
          note: note || "Repair quote is ready for customer approval.",
          quotedAmountPaise: amountPaise
        });
        if (!ticket) return false;

        if (ticket.telegram_user_id) {
          try {
            await callTelegram("sendMessage", {
              chat_id: Number(ticket.telegram_user_id),
              text: [
                "💰 Repair quote ready",
                `Reference: ${ticket.reference_code}`,
                `Quote: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amountPaise / 100)}`,
                ticket.status_note ? `Note: ${ticket.status_note}` : "",
                "",
                "Approve only if you want Mr Mobiles to proceed."
              ].filter(Boolean).join("\n"),
              reply_markup: {
                inline_keyboard: [[
                  { text: "✅ Approve Quote", callback_data: `repair_approve:${ticket.reference_code}` },
                  { text: "👤 Talk to Human", callback_data: "human_support" }
                ]]
              }
            });
          } catch {
            // Quote remains stored even if notification delivery fails.
          }
        }
        return true;
      },
      async approveRepair(userId, referenceCode) {
        const ticket = await approveRepairQuote(userId, referenceCode);
        if (!ticket) return false;

        if (config.supportChatId && config.admins.length) {
          try {
            await callTelegram("sendMessage", {
              chat_id: config.supportChatId,
              text: [
                "✅ Repair quote approved",
                `Reference: ${ticket.reference_code}`,
                `Customer ID: ${userId}`,
                "Status: approved",
                "",
                "Tap the next repair action below."
              ].join("\n"),
              reply_markup: repairAdminKeyboard(ticket.reference_code, userId)
            });
          } catch {
            // Approval is already stored.
          }
        }
        return true;
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
