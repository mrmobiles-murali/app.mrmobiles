import { NextRequest, NextResponse } from "next/server";
import { analyzeRepairPhoto, answerBusinessQuestion, aiRuntimeConfigured } from "@/lib/business-ai";
import { getInventoryProductsByIds, searchInventoryProducts } from "@/lib/server-catalog";
import { approveRepairQuote, cancelTelegramRepairTicket, createTelegramRepairTicket, getTelegramRepairTicket, listTelegramRepairTickets, REPAIR_STATUSES, updateRepairTicket } from "@/lib/repair-tickets";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminIds, BOT_COMMANDS, BOT_WORKFLOW_VERSION, businessCompatibleMessageBody, derivedWebhookSecret, handleBotUpdate, matchesSecret, miniAppUrl, versionedMiniAppUrl, repairRushGameUrl, isRepairRushUpdate, REPAIR_RUSH_SHORT_NAME, REPAIR_RUSH_BOT_USERNAME } from "@/lib/telegram-workflow";

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

function repairAdminKeyboard(referenceCode: string, userId?: number, status = "received") {
  const rows: Array<Array<Record<string, string>>> = [];

  if (status === "received") {
    rows.push([
      { text: "✅ Accept", callback_data: `repair_admin:${referenceCode}:reviewing` },
      { text: "❌ Decline", callback_data: `repair_admin:${referenceCode}:rejected` }
    ]);
  }

  rows.push([{ text: "🛠 Open Repair Ticket", callback_data: `admin_ticket:${referenceCode}` }]);

  if (Number.isSafeInteger(userId) && Number(userId) > 0) {
    rows.push([
      {
        text: "⚡ Default Reply",
        callback_data: `reply_default:${referenceCode}:${userId}`
      },
      {
        text: "✍️ Custom Reply",
        callback_data: `reply_customer:${referenceCode}:${userId}`
      }
    ]);
  }

  return { inline_keyboard: rows };
}

function repairCustomerKeyboard(referenceCode: string, status: string) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "📍 Track Repair", callback_data: `repair_status:${referenceCode}` }]
  ];

  if (["received", "reviewing", "diagnosing", "awaiting_approval", "approved"].includes(status)) {
    rows.push([{ text: "🚫 Cancel Request", callback_data: `repair_cancel_prompt:${referenceCode}` }]);
  }

  rows.push([{ text: "👤 Talk to Human", callback_data: "human_support" }]);
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
    customerRepairCancellation: true,
    adminRepairAcceptDecline: true,
    homeDashboard: true,
    paymentLifecycleNotifications: true,
    profileSelfHeal: true,
    adminRepairControls: true,
    adminStateGuard: true,
    contextualAdminReplies: true,
    quickWarrantyActions: true,
    repairLifecycleNotifications: true,
    accountSummary: true,
    loyaltyPoints: true,
    referralAttribution: true,
    adminDashboard: true,
    photoRepairIntake: true,
    telegramBusinessUpdatesReady: true,
    aiVisualRepairTriage: true,
    technicianAssignment: true,
    repairSlaTracking: true,
    serviceWarranties: true,
    webhookUpdateDeduplication: true,
    compactRepairReplies: true,
    secureOrderReceipts: true,
    printableReceiptPdf: true,
    inventoryAdminControls: true,
    generatedCatalogVisuals: true,
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
  method: string;
  telegramDescription: string;

  constructor(code: number, method: string, description = "") {
    super(`Telegram API failed (${code}) in ${method}.`);
    this.code = code;
    this.method = method;
    this.telegramDescription = description;
  }
}

async function claimTelegramUpdate(update: unknown): Promise<number | null> {
  const updateId = Number((update as any)?.update_id);
  if (!Number.isSafeInteger(updateId) || updateId < 0) return null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("telegram_webhook_updates")
    .insert({ update_id: updateId });

  if (!error) {
    if (updateId % 128 === 0) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      void supabase.from("telegram_webhook_updates").delete().lt("received_at", cutoff);
    }
    return updateId;
  }

  if (error.code === "23505") return -1;

  // If the dedupe store is temporarily unavailable, keep customer support alive.
  return null;
}

async function releaseTelegramUpdate(updateId: number | null) {
  if (!Number.isSafeInteger(updateId) || Number(updateId) < 0) return;
  try {
    await getSupabaseAdmin()
      .from("telegram_webhook_updates")
      .delete()
      .eq("update_id", updateId);
  } catch {
    // A failed cleanup should not mask the original webhook error.
  }
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

  let claimedUpdateId: number | null = null;

  try {
    // Signed diagnostic: it cannot send a Telegram message.
    if ((update as any)?.mr_mobiles_probe === true && !(update as any)?.message) {
      return NextResponse.json(status(request));
    }

    claimedUpdateId = await claimTelegramUpdate(update);
    if (claimedUpdateId === -1) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Self-heal the Telegram webhook subscription after a signed /start update.
    // This is idempotent, preserves pending updates and never exposes the bot token.
    const businessMessage = (update as any)?.business_message;
    const normalizedUpdate = businessMessage
      ? { ...(update as any), message: businessMessage }
      : update;
    const businessConnectionId = typeof businessMessage?.business_connection_id === "string"
      ? businessMessage.business_connection_id
      : undefined;

    const incomingText = typeof (normalizedUpdate as any)?.message?.text === "string"
      ? (normalizedUpdate as any).message.text.trim()
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
          allowed_updates: [
            "message",
            "inline_query",
            "callback_query",
            "business_connection",
            "business_message",
            "edited_business_message",
            "deleted_business_messages"
          ],
          max_connections: 5,
          drop_pending_updates: false
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        const rawDescription = typeof data?.description === "string" ? data.description : "";
        const safeDescription = rawDescription.replaceAll(token, "[redacted]").slice(0, 240);
        throw new TelegramError(Number(data?.error_code || response.status), "setWebhook", safeDescription);
      }
    }

    const businessChatId = Number(businessMessage?.chat?.id);
    const callTelegram = async (method: string, body: Record<string, unknown>) => {
      const sameBusinessChat = Number.isSafeInteger(businessChatId) && Number(body.chat_id) === businessChatId;
      const compatibleBody = businessConnectionId && sameBusinessChat && method === "sendMessage"
        ? businessCompatibleMessageBody(body, botUsername)
        : body;
      const businessAwareBody = businessConnectionId && sameBusinessChat && ["sendMessage", "sendChatAction"].includes(method)
        ? { ...compatibleBody, business_connection_id: businessConnectionId }
        : compatibleBody;
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessAwareBody), cache: "no-store", signal: AbortSignal.timeout(12000)
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        const rawDescription = typeof data?.description === "string" ? data.description : "";
        const safeDescription = rawDescription.replaceAll(token, "[redacted]").slice(0, 240);
        throw new TelegramError(Number(data?.error_code || response.status), method, safeDescription);
      }
      return data.result;
    };

    let botUsername: string | undefined;
    const needsBotUsername =
      Boolean((normalizedUpdate as any)?.inline_query) ||
      Boolean(businessMessage) ||
      isRepairRushUpdate(normalizedUpdate) ||
      incomingCommand === "/refer" ||
      (normalizedUpdate as any)?.callback_query?.data === "refer_link";
    if (needsBotUsername) {
      const me = await callTelegram("getMe", {}) as any;
      if (typeof me?.username === "string") botUsername = me.username;
    }

    const config = settings(request);
    // BotFather registered this game to @MrMobileDoctor_bot. Do not try to
    // launch it with another bot's token, even if an optional URL was set.
    if (isRepairRushUpdate(normalizedUpdate) && botUsername?.toLowerCase() !== REPAIR_RUSH_BOT_USERNAME.toLowerCase()) {
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

    await handleBotUpdate(normalizedUpdate, {
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
      async repairIntake(userId, name, details, photoFileId) {
        try {
          const ticket = await createTelegramRepairTicket({
            telegramUserId: userId,
            customerName: name,
            details
          });

          let aiTriage: string | undefined;
          if (photoFileId && aiRuntimeConfigured()) {
            try {
              const file = await callTelegram("getFile", { file_id: photoFileId }) as any;
              const filePath = typeof file?.file_path === "string" ? file.file_path : "";
              const fileSize = Number(file?.file_size || 0);
              if (filePath && (!fileSize || fileSize <= 8 * 1024 * 1024)) {
                const photoResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
                  cache: "no-store",
                  signal: AbortSignal.timeout(12000)
                });
                const contentType = photoResponse.headers.get("content-type") || "image/jpeg";
                if (photoResponse.ok && contentType.startsWith("image/")) {
                  const buffer = Buffer.from(await photoResponse.arrayBuffer());
                  if (buffer.byteLength <= 8 * 1024 * 1024) {
                    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
                    aiTriage = (await analyzeRepairPhoto(details, dataUrl)) || undefined;
                  }
                }
              }
            } catch {
              // Photo triage is optional. The repair ticket and technician review must still continue.
            }
          }

          if (
            config.supportChatId &&
            config.admins.length &&
            Number(config.supportChatId) !== Number(userId)
          ) {
            try {
              const adminText = [
                "🛠 New repair ticket",
                `Reference: ${ticket.reference_code}`,
                `Name: ${name}`,
                `Customer ID: ${userId}`,
                `Device: ${[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}`,
                `Issue: ${ticket.issue_or_condition}`,
                aiTriage ? `AI visual pre-check: ${aiTriage}` : "",
                "",
                "Tap an action below — customer ID and repair reference are already linked."
              ].filter(Boolean).join("\n");
              if (photoFileId) {
                await callTelegram("sendPhoto", {
                  chat_id: config.supportChatId,
                  photo: photoFileId,
                  caption: adminText.slice(0, 1024),
                  reply_markup: repairAdminKeyboard(ticket.reference_code, userId)
                });
              } else {
                await callTelegram("sendMessage", {
                  chat_id: config.supportChatId,
                  text: adminText,
                  reply_markup: repairAdminKeyboard(ticket.reference_code, userId)
                });
              }
            } catch {
              // Ticket remains valid even if the admin notification is temporarily unavailable.
            }
          }

          return { referenceCode: ticket.reference_code, ...(aiTriage ? { aiTriage } : {}) };
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
      async cancelRepair(userId, referenceCode) {
        const ticket = await cancelTelegramRepairTicket(userId, referenceCode);
        if (!ticket) return false;

        if (
          config.supportChatId &&
          config.admins.length &&
          Number(config.supportChatId) !== Number(userId)
        ) {
          try {
            await callTelegram("sendMessage", {
              chat_id: config.supportChatId,
              text: [
                "🚫 Customer cancelled repair",
                `Reference: ${ticket.reference_code}`,
                `Customer ID: ${userId}`,
                "Status: cancelled"
              ].join("\n"),
              reply_markup: repairAdminKeyboard(ticket.reference_code, userId, "cancelled")
            });
          } catch {
            // Cancellation is already stored even if the admin notice fails.
          }
        }

        return true;
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
              reply_markup: repairCustomerKeyboard(ticket.reference_code, ticket.status)
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
                inline_keyboard: [
                  [
                    { text: "✅ Approve Quote", callback_data: `repair_approve:${ticket.reference_code}` },
                    { text: "🚫 Cancel", callback_data: `repair_cancel_prompt:${ticket.reference_code}` }
                  ],
                  [{ text: "👤 Talk to Human", callback_data: "human_support" }]
                ]
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
              reply_markup: repairAdminKeyboard(ticket.reference_code, userId, "approved")
            });
          } catch {
            // Approval is already stored.
          }
        }
        return true;
      },
      async accountSummary(userId) {
        const supabase = getSupabaseAdmin();
        const [
          { data: orders, error: orderError },
          { data: repairs, error: repairError },
          { data: warranties, error: warrantyError }
        ] = await Promise.all([
          supabase.from("orders")
            .select("amount_paise,status")
            .eq("telegram_user_id", userId)
            .limit(500),
          supabase.from("service_requests")
            .select("device_brand,device_model,status")
            .eq("request_type", "repair")
            .eq("source", "telegram")
            .eq("telegram_user_id", userId)
            .limit(500),
          supabase.from("customer_warranties")
            .select("id")
            .eq("telegram_user_id", userId)
            .eq("status", "active")
            .gte("end_at", new Date().toISOString())
            .limit(500)
        ]);
        if (orderError || repairError || warrantyError) throw new Error("Account summary lookup failed.");
        const paid = (orders || []).filter(order => order.status === "paid");
        const paidSpendPaise = paid.reduce((sum, order) => sum + Number(order.amount_paise || 0), 0);
        const activeStatuses = new Set(["received","reviewing","diagnosing","awaiting_approval","approved","repairing","ready"]);
        const devices = new Set((repairs || [])
          .map(ticket => [ticket.device_brand, ticket.device_model].filter(Boolean).join(" ").trim())
          .filter(Boolean));
        return {
          orderCount: (orders || []).length,
          paidOrderCount: paid.length,
          paidSpendPaise,
          loyaltyPoints: Math.floor(paidSpendPaise / 10000),
          repairCount: (repairs || []).length,
          activeRepairs: (repairs || []).filter(ticket => activeStatuses.has(ticket.status)).length,
          savedDevices: devices.size,
          activeWarranties: (warranties || []).length
        };
      },
      async recordReferral(referredUserId, referrerUserId, source = "bot_start") {
        if (referredUserId === referrerUserId) return false;
        const { error } = await getSupabaseAdmin().from("telegram_referrals").insert({
          referred_user_id: referredUserId,
          referrer_user_id: referrerUserId,
          source
        });
        if (!error) return true;
        return error.code === "23505";
      },
      async adminDashboard() {
        const supabase = getSupabaseAdmin();
        const [ordersResult, repairsResult, productsResult, referralsResult, feedbackResult] = await Promise.all([
          supabase.from("orders").select("amount_paise,status,workflow_status").limit(1000),
          supabase.from("service_requests")
            .select("reference_code,customer_name,telegram_user_id,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,technician_name,sla_due_at,created_at,updated_at")
            .eq("request_type", "repair")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase.from("products").select("stock_qty,active").eq("active", true).limit(500),
          supabase.from("telegram_referrals").select("id").limit(1000),
          supabase.from("ai_feedback").select("rating").limit(1000)
        ]);
        if (ordersResult.error || repairsResult.error || productsResult.error || referralsResult.error || feedbackResult.error) {
          throw new Error("Admin dashboard lookup failed.");
        }
        const orders = ordersResult.data || [];
        const repairs = repairsResult.data || [];
        const paid = orders.filter(order => order.status === "paid");
        const openStatuses = new Set(["received","reviewing","diagnosing","awaiting_approval","approved","repairing","ready"]);
        return {
          orderCount: orders.length,
          paidOrderCount: paid.length,
          revenuePaise: paid.reduce((sum, order) => sum + Number(order.amount_paise || 0), 0),
          paymentIssues: orders.filter(order => order.status === "payment_failed" || order.workflow_status === "payment_issue").length,
          openRepairs: repairs.filter(ticket => openStatuses.has(ticket.status)).length,
          awaitingApproval: repairs.filter(ticket => ticket.status === "awaiting_approval").length,
          readyRepairs: repairs.filter(ticket => ticket.status === "ready").length,
          lowStock: (productsResult.data || []).filter(product => typeof product.stock_qty === "number" && product.stock_qty <= 2).length,
          referralCount: (referralsResult.data || []).length,
          positiveFeedback: (feedbackResult.data || []).filter(item => item.rating === 1).length,
          negativeFeedback: (feedbackResult.data || []).filter(item => item.rating === -1).length,
          overdueSla: repairs.filter(ticket =>
            openStatuses.has(ticket.status) &&
            ticket.sla_due_at &&
            new Date(ticket.sla_due_at).getTime() < Date.now()
          ).length,
          unknownStock: (productsResult.data || []).filter(product => product.stock_qty == null).length,
          recentRepairs: repairs.filter(ticket => openStatuses.has(ticket.status)).slice(0, 5)
        };
      },
      async adminRepairTicket(referenceCode) {
        const { data, error } = await getSupabaseAdmin().from("service_requests")
          .select("reference_code,customer_name,telegram_user_id,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,technician_name,sla_due_at,created_at,updated_at")
          .eq("request_type", "repair")
          .eq("reference_code", referenceCode)
          .maybeSingle();
        if (error) throw new Error("Admin repair lookup failed.");
        return data || null;
      },
      async repairAssign(referenceCode, technicianName) {
        const { data, error } = await getSupabaseAdmin().from("service_requests")
          .update({
            technician_name: technicianName.trim().slice(0, 80),
            updated_at: new Date().toISOString()
          })
          .eq("request_type", "repair")
          .eq("reference_code", referenceCode)
          .select("reference_code")
          .maybeSingle();
        return !error && Boolean(data);
      },
      async repairSetSla(referenceCode, hours) {
        const due = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        const { data, error } = await getSupabaseAdmin().from("service_requests")
          .update({ sla_due_at: due, updated_at: new Date().toISOString() })
          .eq("request_type", "repair")
          .eq("reference_code", referenceCode)
          .select("reference_code")
          .maybeSingle();
        return !error && Boolean(data);
      },
      async createWarranty(referenceCode, days, note) {
        const supabase = getSupabaseAdmin();
        const { data: ticket, error: ticketError } = await supabase.from("service_requests")
          .select("reference_code,telegram_user_id,device_brand,device_model,status")
          .eq("request_type", "repair")
          .eq("reference_code", referenceCode)
          .maybeSingle();
        if (ticketError || !ticket || ticket.status !== "completed" || !ticket.telegram_user_id) return false;

        const startAt = new Date();
        const endAt = new Date(startAt.getTime() + days * 24 * 60 * 60 * 1000);
        const warrantyCode = `MRW-${referenceCode.replace(/^MRR-/, "")}`;
        const deviceLabel = [ticket.device_brand, ticket.device_model].filter(Boolean).join(" ") || "Repaired device";
        const { error } = await supabase.from("customer_warranties").upsert({
          warranty_code: warrantyCode,
          repair_reference: referenceCode,
          telegram_user_id: Number(ticket.telegram_user_id),
          device_label: deviceLabel,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          status: "active",
          note: note.trim().slice(0, 500) || null,
          updated_at: new Date().toISOString()
        }, { onConflict: "repair_reference" });
        if (error) return false;

        try {
          await callTelegram("sendMessage", {
            chat_id: Number(ticket.telegram_user_id),
            text: [
              "🛡 Mr Mobiles service warranty",
              `Warranty: ${warrantyCode}`,
              `Repair: ${referenceCode}`,
              `Device: ${deviceLabel}`,
              `Valid until: ${endAt.toLocaleDateString("en-IN")}`,
              note ? `Terms: ${note.trim().slice(0, 500)}` : "",
              "",
              "Keep this message with your service record. Warranty scope follows the terms confirmed by Mr Mobiles."
            ].filter(Boolean).join("\n")
          });
        } catch {
          // Warranty record is authoritative even if Telegram delivery is temporarily unavailable.
        }
        return true;
      },
      async inventoryAdmin() {
        const { data, error } = await getSupabaseAdmin().from("products")
          .select("id,name,stock_qty")
          .eq("active", true)
          .order("name", { ascending: true })
          .limit(100);
        if (error) throw new Error("Inventory lookup failed.");
        return (data || []).map(item => ({
          id: item.id,
          name: item.name,
          stockQty: item.stock_qty
        }));
      },
      async updateStock(productId, qty) {
        const { data, error } = await getSupabaseAdmin().from("products")
          .update({ stock_qty: qty, updated_at: new Date().toISOString() })
          .eq("id", productId)
          .eq("active", true)
          .select("id")
          .maybeSingle();
        return !error && Boolean(data);
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
    const method = error instanceof TelegramError ? error.method : "internal";
    const description = error instanceof TelegramError ? error.telegramDescription : "";
    console.error("Telegram workflow request failed", { code, method, description });
    if (code === 400 || code === 403) {
      return NextResponse.json({ ok: true, deliveryFailed: true });
    }
    await releaseTelegramUpdate(claimedUpdateId);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
