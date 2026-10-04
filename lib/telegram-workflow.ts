import crypto from "node:crypto";

export const BOT_WORKFLOW_VERSION = "2026-10-03.ops-final";
export const REPAIR_RUSH_SHORT_NAME = "repairrush";
export const REPAIR_RUSH_BOT_USERNAME = "MrMobileDoctor_bot";
const WEBSITE_PRODUCT_NAMES: Record<number, string> = {
  1: "iPhone 13 Pro 128GB",
  2: "iPhone 12 64GB",
  3: "iPhone 11 128GB",
  4: "Galaxy S22 Ultra",
  5: "OnePlus 11R 5G",
  6: "Pixel 7",
  7: "iPhone 14 Pro Deep Purple",
  8: "Galaxy Z Fold4 Limited"
};

function parseWebsiteCartStartPayload(payload: string): Array<{ websiteId: number; qty: number }> {
  const match = payload.match(/^cart_([0-9x_]{3,56})$/i);
  if (!match) return [];
  const seen = new Set<number>();
  const items: Array<{ websiteId: number; qty: number }> = [];
  for (const part of match[1].split("_")) {
    const entry = part.match(/^(\d{1,2})x([1-5])$/);
    if (!entry) continue;
    const websiteId = Number(entry[1]);
    const qty = Number(entry[2]);
    if (!WEBSITE_PRODUCT_NAMES[websiteId] || seen.has(websiteId)) continue;
    seen.add(websiteId);
    items.push({ websiteId, qty });
  }
  return items.slice(0, 8);
}

function websiteProductSearchName(websiteId: number): string | null {
  return WEBSITE_PRODUCT_NAMES[websiteId] || null;
}

function encodeMiniAppWebsiteCart(items: Array<{ productId: string; qty: number }>): string {
  return items
    .filter((item) => /^[A-Za-z0-9_-]{1,64}$/.test(item.productId) && Number.isInteger(item.qty) && item.qty >= 1 && item.qty <= 5)
    .slice(0, 8)
    .map((item) => item.productId + "~" + item.qty)
    .join(",");
}

export const DEFAULT_REPAIR_REPLY = [
  "Your repair request has been received ✅",
  "We’ll contact you soon.",
  "Don’t worry — MR MOBILES is here. We connect you to the world 🌎"
].join("\n");
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome and open Mr Mobiles" },
  { command: "menu", description: "Open the Mr Mobiles control menu" },
  { command: "ai", description: "Ask the Mr Mobiles AI assistant" },
  { command: "shop", description: "Browse phones and accessories" },
  { command: "game", description: "Play Mr Mobiles Repair Rush" },
  { command: "repair", description: "Start repair help" },
  { command: "repairs", description: "View your repair tickets" },
  { command: "repairstatus", description: "Track a repair reference" },
  { command: "orders", description: "View your recent orders" },
  { command: "account", description: "Open your Mr Mobiles account" },
  { command: "refer", description: "Get your Mr Mobiles referral link" },
  { command: "paysupport", description: "Get payment support" },
  { command: "support", description: "Contact the Mr Mobiles team" },
  { command: "privacy", description: "AI chat and privacy information" },
  { command: "help", description: "See how to use this bot" },
  { command: "id", description: "Show your Telegram user ID" }
];

export function derivedWebhookSecret(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export function matchesSecret(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function miniAppUrl(requestUrl: string, configured?: string): string {
  const url = new URL(configured || new URL(requestUrl).origin);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("TELEGRAM_MINI_APP_URL must be an HTTPS URL without credentials.");
  }
  return url.toString();
}

export function versionedMiniAppUrl(appUrl: string): string {
  const url = new URL(appUrl);
  url.searchParams.set("v", BOT_WORKFLOW_VERSION);
  return url.toString();
}

export function repairRushGameUrl(configured?: string): string | undefined {
  if (!configured) return undefined;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("REPAIR_RUSH_GAME_URL must be a public HTTPS URL without credentials or parameters.");
  }
  return url.href;
}

export function isRepairRushUpdate(update: unknown): boolean {
  const candidate = update as any;
  const text = typeof candidate?.message?.text === "string" ? candidate.message.text.trim() : "";
  const query = typeof candidate?.inline_query?.query === "string" ? candidate.inline_query.query.trim() : "";
  return typeof candidate?.callback_query?.game_short_name === "string" ||
    candidate?.callback_query?.data === "repairrush_play" ||
    /^\/game(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text) ||
    /^\/start(?:@[A-Za-z0-9_]+)?\s+repairrush$/i.test(text) ||
    /^(repairrush|repair rush|game)$/i.test(query);
}

export function adminIds(value = ""): number[] {
  return [...new Set(value.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s))
    .map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}

export type RecentOrder = {
  id: string;
  amount_paise: number;
  status: string;
  workflow_status?: string;
};

export type RepairTicketSummary = {
  reference_code: string;
  device_brand?: string | null;
  device_model: string;
  issue_or_condition: string;
  status: string;
  quoted_amount_paise?: number | null;
  status_note?: string | null;
  created_at?: string;
  updated_at?: string;
  technician_name?: string | null;
  sla_due_at?: string | null;
};

export type AccountSummary = {
  orderCount: number;
  paidOrderCount: number;
  paidSpendPaise: number;
  loyaltyPoints: number;
  repairCount: number;
  activeRepairs: number;
  savedDevices: number;
  activeWarranties: number;
};

export type AdminRepairTicket = RepairTicketSummary & {
  telegram_user_id?: number | null;
  customer_name?: string | null;
};

export type AdminDashboardSummary = {
  orderCount: number;
  paidOrderCount: number;
  revenuePaise: number;
  paymentIssues: number;
  openRepairs: number;
  awaitingApproval: number;
  readyRepairs: number;
  lowStock: number;
  referralCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  overdueSla: number;
  recentRepairs: AdminRepairTicket[];
};

export type InlineProduct = {
  id: string;
  name: string;
  subtitle: string;
  pricePaise: number;
  category: "phone" | "accessory" | "service";
  emoji: string;
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  stockQty?: number | null;
};

export type AiAssistantReply = {
  text: string;
  products: InlineProduct[];
  usedModel: boolean;
  responseId?: number;
};

export type TelegramCall = (method: string, body: Record<string, unknown>) => Promise<unknown>;

export type BotContext = {
  appUrl: string;
  gameUrl?: string;
  admins: number[];
  supportChatId?: number;
  botUsername?: string;
  call: TelegramCall;
  orders: (userId: number) => Promise<RecentOrder[]>;
  searchProducts: (query: string) => Promise<InlineProduct[]>;
  productsByIds?: (ids: string[]) => Promise<InlineProduct[]>;
  aiReply?: (
    userId: number,
    message: string,
    onDraft?: (partial: string) => Promise<void>
  ) => Promise<AiAssistantReply>;
  handoff?: (userId: number, name: string) => Promise<boolean>;
  repairIntake?: (userId: number, name: string, details: string, photoFileId?: string) => Promise<{ referenceCode: string; aiTriage?: string } | null>;
  repairAssign?: (referenceCode: string, technicianName: string) => Promise<boolean>;
  repairSetSla?: (referenceCode: string, hours: number) => Promise<boolean>;
  createWarranty?: (referenceCode: string, days: number, note: string) => Promise<boolean>;
  accountSummary?: (userId: number) => Promise<AccountSummary>;
  recordReferral?: (referredUserId: number, referrerUserId: number, source?: "bot_start" | "mini_app") => Promise<boolean>;
  adminDashboard?: () => Promise<AdminDashboardSummary>;
  adminRepairTicket?: (referenceCode: string) => Promise<AdminRepairTicket | null>;
  repairs?: (userId: number) => Promise<RepairTicketSummary[]>;
  repairStatus?: (userId: number, referenceCode: string) => Promise<RepairTicketSummary | null>;
  repairUpdate?: (referenceCode: string, status: string, note: string) => Promise<boolean>;
  repairQuote?: (referenceCode: string, amountPaise: number, note: string) => Promise<boolean>;
  approveRepair?: (userId: number, referenceCode: string) => Promise<boolean>;
  feedback?: (userId: number, responseId: number, rating: 1 | -1) => Promise<boolean>;
};

function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(paise) / 100);
}

function stockLabel(product: InlineProduct): string {
  return typeof product.stockQty === "number"
    ? (product.stockQty > 0 ? `${product.stockQty} in stock` : "Out of stock")
    : "Stock confirmation required";
}

function productWebAppUrl(appUrl: string, product: InlineProduct, buy = false) {
  const url = new URL(versionedMiniAppUrl(appUrl));
  url.searchParams.set("category", product.category);
  url.searchParams.set("product", product.id);
  if (buy) url.searchParams.set("buy", "1");
  return url.toString();
}

function callbackData(prefix: string, value: string): string | null {
  const data = `${prefix}${value}`;
  return Buffer.byteLength(data, "utf8") <= 64 ? data : null;
}

function aiKeyboard(context: BotContext, products: InlineProduct[], responseId?: number) {
  const rows: Array<Array<Record<string, unknown>>> = [];
  const visible = products.slice(0, 2);

  for (const product of visible) {
    const shortName = product.name.length > 22 ? product.name.slice(0, 19) + "…" : product.name;
    rows.push([
      { text: `👀 ${shortName}`, web_app: { url: productWebAppUrl(context.appUrl, product) } },
      { text: "🛒 Buy", web_app: { url: productWebAppUrl(context.appUrl, product, true) } }
    ]);

    const stock = callbackData("stock:", product.id);
    if (stock) rows.push([{ text: "📦 Check Live Stock", callback_data: stock }]);
  }

  if (visible.length >= 2) {
    const compare = callbackData("compare:", `${visible[0].id}~${visible[1].id}`);
    if (compare) rows.push([{ text: "⚖️ Compare These 2", callback_data: compare }]);
  }

  rows.push([
    { text: "🛠 Repair Help", callback_data: "repair_start" },
    { text: "👤 Talk to Human", callback_data: "human_support" }
  ]);

  if (responseId && Number.isSafeInteger(responseId)) {
    rows.push([
      { text: "👍 Helpful", callback_data: `feedback:1:${responseId}` },
      { text: "👎 Needs Work", callback_data: `feedback:-1:${responseId}` }
    ]);
  }

  rows.push([{ text: "🛍 Open Shop", web_app: { url: versionedMiniAppUrl(context.appUrl) } }]);
  return { inline_keyboard: rows };
}

function comparisonText(products: InlineProduct[]): string {
  return products.slice(0, 2).map((product, index) => {
    const identity = [product.brand, product.model].filter(Boolean).join(" • ");
    return [
      `${index + 1}. ${product.emoji} ${product.name}`,
      identity,
      `Price: ${formatInr(product.pricePaise)}`,
      `Stock: ${stockLabel(product)}`,
      product.subtitle
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function repairStatusText(ticket: RepairTicketSummary): string {
  const device = [ticket.device_brand, ticket.device_model].filter(Boolean).join(" ");
  const quote = typeof ticket.quoted_amount_paise === "number"
    ? `\nQuote: ${formatInr(ticket.quoted_amount_paise)}`
    : "";
  const note = ticket.status_note ? `\nNote: ${ticket.status_note}` : "";
  return [
    `🛠 Repair ${ticket.reference_code}`,
    device || ticket.device_model,
    `Issue: ${ticket.issue_or_condition}`,
    `Status: ${ticket.status}${quote}${note}`
  ].filter(Boolean).join("\n");
}

function accountSummaryText(summary: AccountSummary): string {
  return [
    "👤 Mr Mobiles Account",
    "",
    `Orders: ${summary.orderCount} • Paid: ${summary.paidOrderCount}`,
    `Paid spend: ${formatInr(summary.paidSpendPaise)}`,
    `MR Points: ${summary.loyaltyPoints} (1 point / ₹100 paid)`,
    `Repairs: ${summary.repairCount} • Active: ${summary.activeRepairs}`,
    `Saved devices: ${summary.savedDevices}`,
    `Active warranties: ${summary.activeWarranties}`
  ].join("\n");
}

function adminDashboardText(summary: AdminDashboardSummary): string {
  return [
    "📊 Mr Mobiles Admin",
    "",
    `Orders: ${summary.orderCount} • Paid: ${summary.paidOrderCount}`,
    `Revenue: ${formatInr(summary.revenuePaise)}`,
    `Payment issues: ${summary.paymentIssues}`,
    "",
    `Open repairs: ${summary.openRepairs}`,
    `Awaiting approval: ${summary.awaitingApproval}`,
    `Ready: ${summary.readyRepairs}`,
    `Low stock: ${summary.lowStock}`,
    `Referrals: ${summary.referralCount}`,
    `SLA overdue: ${summary.overdueSla}`,
    `AI feedback: 👍 ${summary.positiveFeedback} • 👎 ${summary.negativeFeedback}`
  ].join("\n");
}

function adminTicketKeyboard(ticket: AdminRepairTicket) {
  const rows: Array<Array<Record<string, unknown>>> = [];
  const status = String(ticket.status || "");

  if (status === "received" || status === "reviewing") {
    rows.push([{ text: "🔎 Start Diagnosis", callback_data: `repair_admin:${ticket.reference_code}:diagnosing` }]);
  } else if (status === "diagnosing") {
    rows.push([{ text: "💰 Send Repair Quote", callback_data: `repair_quote_prompt:${ticket.reference_code}` }]);
  } else if (status === "awaiting_approval") {
    rows.push([
      { text: "💰 Update Quote", callback_data: `repair_quote_prompt:${ticket.reference_code}` },
      { text: "🔄 Refresh", callback_data: `admin_ticket:${ticket.reference_code}` }
    ]);
  } else if (status === "approved") {
    rows.push([{ text: "💳 Awaiting Quote Payment", callback_data: `admin_ticket:${ticket.reference_code}` }]);
  } else if (status === "repairing") {
    rows.push([{ text: "📦 Mark Ready", callback_data: `repair_admin:${ticket.reference_code}:ready` }]);
  } else if (status === "ready") {
    rows.push([{ text: "✅ Mark Delivered / Completed", callback_data: `repair_admin:${ticket.reference_code}:completed` }]);
  } else if (status === "completed") {
    rows.push([
      { text: "🛡 30d Warranty", callback_data: `warranty_quick:${ticket.reference_code}:30` },
      { text: "🛡 90d Warranty", callback_data: `warranty_quick:${ticket.reference_code}:90` }
    ]);
    rows.push([{ text: "🛡 Custom Warranty", callback_data: `warranty_prompt:${ticket.reference_code}` }]);
  }

  if (!["completed", "cancelled", "rejected"].includes(status)) {
    rows.push([
      { text: "👨‍🔧 Assign", callback_data: `repair_assign_prompt:${ticket.reference_code}` },
      { text: "⏱ SLA", callback_data: `repair_sla_prompt:${ticket.reference_code}` }
    ]);
  }

  const customerId = Number(ticket.telegram_user_id);
  if (Number.isSafeInteger(customerId) && customerId > 0) {
    rows.push([
      {
        text: "⚡ Default Reply",
        callback_data: `reply_default:${ticket.reference_code}:${customerId}`
      },
      {
        text: "✍️ Custom Reply",
        callback_data: `reply_customer:${ticket.reference_code}:${customerId}`
      }
    ]);
  }

  rows.push([
    { text: "🔄 Refresh Ticket", callback_data: `admin_ticket:${ticket.reference_code}` },
    { text: "⬅️ Dashboard", callback_data: "admin_dashboard" }
  ]);
  return { inline_keyboard: rows };
}

function adminRepairText(ticket: AdminRepairTicket): string {
  return [
    `🛠 ${ticket.reference_code}`,
    [ticket.device_brand, ticket.device_model].filter(Boolean).join(" "),
    `Customer: ${ticket.customer_name || "Telegram customer"}`,
    `Issue: ${ticket.issue_or_condition}`,
    `Status: ${ticket.status}`,
    typeof ticket.quoted_amount_paise === "number" ? `Quote: ${formatInr(ticket.quoted_amount_paise)}` : "",
    ticket.technician_name ? `Technician: ${ticket.technician_name}` : "",
    ticket.sla_due_at ? `SLA due: ${new Date(ticket.sla_due_at).toLocaleString("en-IN")}` : "",
    ticket.status_note ? `Note: ${ticket.status_note}` : ""
  ].filter(Boolean).join("\n");
}

function referralLink(context: BotContext, userId: number): string | null {
  const username = context.botUsername?.replace(/^@/, "");
  return username ? `https://t.me/${username}?start=ref_${userId}` : null;
}

function homeKeyboard(context: BotContext, isAdmin = false) {
  return {
    inline_keyboard: [
      [
        { text: "🛍 Shop", web_app: { url: versionedMiniAppUrl(context.appUrl) } },
        { text: "🤖 AI Help", callback_data: "ai_help" }
      ],
      [
        { text: "👤 My Account", callback_data: "account_summary" },
        { text: "🎁 Refer", callback_data: "refer_link" }
      ],
      [
        { text: "🧾 Orders", callback_data: "orders_latest" },
        { text: "🛠 Repairs", callback_data: "repairs_latest" }
      ],
      [
        { text: "👤 Human Support", callback_data: "human_support" }
      ],
      ...(isAdmin ? [[{ text: "📊 Admin Control Centre", callback_data: "admin_dashboard" }]] : []),
      ...(context.gameUrl ? [[{ text: "🎮 Repair Rush", callback_data: "repairrush_play" }]] : [])
    ]
  };
}

async function safeAnswerCallback(context: BotContext, id: string, text?: string) {
  try {
    await context.call("answerCallbackQuery", {
      callback_query_id: id,
      ...(text ? { text: text.slice(0, 180) } : {})
    });
  } catch {
    // The requested action can still continue if the visual acknowledgement fails.
  }
}

export async function handleBotUpdate(update: unknown, context: BotContext): Promise<void> {
  const callbackQuery = (update as any)?.callback_query;
  // Game callbacks also arrive from groups and inline game messages. Handle them
  // before the private-chat support callbacks, and never append player data.
  if (callbackQuery && typeof callbackQuery.id === "string" &&
      Number.isSafeInteger(callbackQuery?.from?.id) && !callbackQuery?.from?.is_bot &&
      typeof callbackQuery.game_short_name === "string") {
    if (callbackQuery.game_short_name === REPAIR_RUSH_SHORT_NAME && context.gameUrl) {
      await context.call("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        url: repairRushGameUrl(context.gameUrl),
        cache_time: 0
      });
    } else {
      await context.call("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "This game is not available yet. Please try again soon.",
        show_alert: true
      });
    }
    return;
  }
  if (callbackQuery && typeof callbackQuery.id === "string" &&
      Number.isSafeInteger(callbackQuery?.from?.id) && !callbackQuery?.from?.is_bot &&
      Number.isSafeInteger(callbackQuery?.message?.chat?.id)) {
    const adminId = callbackQuery.from.id as number;
    const callbackChatId = callbackQuery.message.chat.id as number;
    const callbackData = typeof callbackQuery.data === "string" ? callbackQuery.data : "";
    const replyMatch = callbackData.match(/^reply_(default|customer):(?:(MRR-[A-F0-9]{10}):)?(\d+)$/i);
    const repairActionMatch = callbackData.match(
      /^repair_admin:(MRR-[A-F0-9]{10}):(diagnosing|repairing|ready|completed)$/i
    );
    const quotePromptMatch = callbackData.match(/^repair_quote_prompt:(MRR-[A-F0-9]{10})$/i);
    const adminTicketMatch = callbackData.match(/^admin_ticket:(MRR-[A-F0-9]{10})$/i);
    const assignPromptMatch = callbackData.match(/^repair_assign_prompt:(MRR-[A-F0-9]{10})$/i);
    const slaPromptMatch = callbackData.match(/^repair_sla_prompt:(MRR-[A-F0-9]{10})$/i);
    const warrantyPromptMatch = callbackData.match(/^warranty_prompt:(MRR-[A-F0-9]{10})$/i);
    const warrantyQuickMatch = callbackData.match(/^warranty_quick:(MRR-[A-F0-9]{10}):(30|90|180)$/i);

    if (adminTicketMatch || repairActionMatch || quotePromptMatch || assignPromptMatch || slaPromptMatch || warrantyPromptMatch || warrantyQuickMatch) {
      if (!context.admins.includes(adminId)) {
        await safeAnswerCallback(context, callbackQuery.id, "This action is for the Mr Mobiles support team.");
        return;
      }
    }

    if (adminTicketMatch) {
      const referenceCode = adminTicketMatch[1].toUpperCase();
      const ticket = context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;
      await safeAnswerCallback(context, callbackQuery.id, ticket ? "Repair ticket opened." : "Repair ticket not found.");
      if (ticket) {
        await context.call("sendMessage", {
          chat_id: callbackChatId,
          text: adminRepairText(ticket),
          reply_markup: adminTicketKeyboard(ticket)
        });
      }
      return;
    }

    if (repairActionMatch) {
      const referenceCode = repairActionMatch[1].toUpperCase();
      const requestedStatus = repairActionMatch[2].toLowerCase();
      const hasStateGuard = Boolean(context.adminRepairTicket);
      const ticket = context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;

      if (hasStateGuard && !ticket) {
        await safeAnswerCallback(context, callbackQuery.id, "Repair ticket not found.");
        return;
      }

      const currentStatus = String(ticket?.status || "");
      const allowed = !hasStateGuard ||
        (requestedStatus === "diagnosing" && ["received", "reviewing"].includes(currentStatus)) ||
        (requestedStatus === "ready" && currentStatus === "repairing") ||
        (requestedStatus === "completed" && currentStatus === "ready");

      if (hasStateGuard && requestedStatus === "repairing") {
        await safeAnswerCallback(context, callbackQuery.id, "Repair starts automatically after confirmed quote payment.");
        await context.call("sendMessage", {
          chat_id: callbackChatId,
          text: `💳 ${referenceCode} will move to repairing automatically after the approved quote payment is confirmed.`,
          ...(ticket ? { reply_markup: adminTicketKeyboard(ticket) } : {})
        });
        return;
      }

      if (!allowed) {
        await safeAnswerCallback(context, callbackQuery.id, `Current status is ${currentStatus}.`);
        await context.call("sendMessage", {
          chat_id: callbackChatId,
          text: `⚠️ ${referenceCode} cannot move from ${currentStatus} to ${requestedStatus}.`,
          ...(ticket ? { reply_markup: adminTicketKeyboard(ticket) } : {})
        });
        return;
      }

      const notes: Record<string, string> = {
        diagnosing: "Device inspection started.",
        ready: "Repair is complete and ready for pickup or delivery.",
        completed: "Repair delivered and ticket completed."
      };
      const ok = context.repairUpdate
        ? await context.repairUpdate(referenceCode, requestedStatus, notes[requestedStatus] || "")
        : false;

      await safeAnswerCallback(
        context,
        callbackQuery.id,
        ok ? `Repair updated to ${requestedStatus} ✅` : "Repair update failed."
      );

      const refreshed = ok && context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: ok
          ? `✅ ${referenceCode} updated to ${requestedStatus}. Customer notification sent.`
          : `⚠️ Could not update ${referenceCode}. Check the ticket and try again.`,
        ...(refreshed ? { reply_markup: adminTicketKeyboard(refreshed) } : {})
      });
      return;
    }

    if (assignPromptMatch) {
      const referenceCode = assignPromptMatch[1].toUpperCase();
      await safeAnswerCallback(context, callbackQuery.id, "Repair reference added automatically.");
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: ["👨‍🔧 MR MOBILES technician", `Reference: ${referenceCode}`, "", "Reply with technician name."].join("\n"),
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Technician name" }
      });
      return;
    }

    if (slaPromptMatch) {
      const referenceCode = slaPromptMatch[1].toUpperCase();
      await safeAnswerCallback(context, callbackQuery.id, "Repair reference added automatically.");
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: ["⏱ MR MOBILES SLA", `Reference: ${referenceCode}`, "", "Reply with SLA hours (1-720).", "Example: 24"].join("\n"),
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "SLA hours" }
      });
      return;
    }

    if (warrantyQuickMatch) {
      const referenceCode = warrantyQuickMatch[1].toUpperCase();
      const days = Number(warrantyQuickMatch[2]);
      const ok = context.createWarranty
        ? await context.createWarranty(referenceCode, days, "Mr Mobiles service warranty.")
        : false;
      await safeAnswerCallback(
        context,
        callbackQuery.id,
        ok ? `${days}-day warranty issued ✅` : "Warranty could not be issued."
      );
      const refreshed = context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: ok
          ? `🛡 Warranty created for ${referenceCode}: ${days} days. Customer notification sent.`
          : `⚠️ Warranty could not be created for ${referenceCode}. Repair must be completed first.`,
        ...(refreshed ? { reply_markup: adminTicketKeyboard(refreshed) } : {})
      });
      return;
    }

    if (warrantyPromptMatch) {
      const referenceCode = warrantyPromptMatch[1].toUpperCase();
      await safeAnswerCallback(context, callbackQuery.id, "Warranty reference added automatically.");
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: ["🛡 MR MOBILES warranty", `Reference: ${referenceCode}`, "", "Reply with: DAYS optional note", "Example: 90 Display replacement service warranty"].join("\n"),
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Warranty days + optional note" }
      });
      return;
    }

    if (quotePromptMatch) {
      const referenceCode = quotePromptMatch[1].toUpperCase();
      const ticket = context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;
      const quoteEditable = !context.adminRepairTicket ||
        Boolean(ticket && ["diagnosing", "awaiting_approval"].includes(String(ticket.status || "")));

      if (!quoteEditable) {
        await safeAnswerCallback(context, callbackQuery.id, ticket ? `Current status is ${ticket.status}.` : "Repair ticket not found.");
        if (ticket) {
          await context.call("sendMessage", {
            chat_id: callbackChatId,
            text: `⚠️ ${referenceCode} cannot be quoted from ${ticket.status}. Refresh the repair ticket.`,
            reply_markup: adminTicketKeyboard(ticket)
          });
        }
        return;
      }

      await safeAnswerCallback(context, callbackQuery.id, "Quote reference added automatically.");
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: [
          "💰 MR MOBILES quote",
          `Reference: ${referenceCode}`,
          "",
          "Reply with: AMOUNT optional note",
          "Example: 2500 Display replacement"
        ].join("\n"),
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: "Amount + optional note"
        }
      });
      return;
    }

    if (replyMatch) {
      if (!context.admins.includes(adminId)) {
        await safeAnswerCallback(context, callbackQuery.id, "This action is for the Mr Mobiles support team.");
        return;
      }

      const referenceCode = replyMatch[2] ? replyMatch[2].toUpperCase() : "";
      const target = Number(replyMatch[3]);
      if (!Number.isSafeInteger(target) || target <= 0) {
        await safeAnswerCallback(context, callbackQuery.id, "Invalid customer ID.");
        return;
      }

      if (replyMatch[1] === "default") {
        try {
          await context.call("sendMessage", {
            chat_id: target,
            text: [
              "💬 Mr Mobiles Support",
              referenceCode ? `Repair: ${referenceCode}` : "",
              "",
              DEFAULT_REPAIR_REPLY
            ].filter(Boolean).join("\n")
          });
          await safeAnswerCallback(context, callbackQuery.id, "Default reply sent ✅");
          await context.call("sendMessage", {
            chat_id: callbackChatId,
            text: `✅ Default reply sent${referenceCode ? ` for ${referenceCode}` : ""} to customer ${target}.`
          });
        } catch {
          await safeAnswerCallback(context, callbackQuery.id, "Reply could not be delivered.");
        }
        return;
      }

      await safeAnswerCallback(context, callbackQuery.id, "Customer ID added automatically.");
      await context.call("sendMessage", {
        chat_id: callbackChatId,
        text: [
          "↩️ MR MOBILES reply",
          referenceCode ? `Reference: ${referenceCode}` : "",
          `Customer ID: ${target}`,
          "",
          "Suggested reply:",
          DEFAULT_REPAIR_REPLY,
          "",
          "Reply to this message with the final text. You can edit the suggestion before sending."
        ].join("\n"),
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: "Edit reply and send"
        }
      });
      return;
    }
  }

  if (callbackQuery && typeof callbackQuery.id === "string" &&
      Number.isSafeInteger(callbackQuery?.from?.id) && !callbackQuery?.from?.is_bot &&
      callbackQuery?.message?.chat?.type === "private" &&
      Number.isSafeInteger(callbackQuery?.message?.chat?.id)) {
    const userId = callbackQuery.from.id as number;
    const chatId = callbackQuery.message.chat.id as number;
    const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";

    if (data === "account_summary") {
      await safeAnswerCallback(context, callbackQuery.id, "Loading your account…");
      const summary = context.accountSummary ? await context.accountSummary(userId) : null;
      await context.call("sendMessage", {
        chat_id: chatId,
        text: summary ? accountSummaryText(summary) : "Your account summary is temporarily unavailable.",
        reply_markup: homeKeyboard(context, context.admins.includes(userId))
      });
      return;
    }

    if (data === "refer_link") {
      await safeAnswerCallback(context, callbackQuery.id, "Preparing your referral link…");
      const link = referralLink(context, userId);
      await context.call("sendMessage", {
        chat_id: chatId,
        text: link
          ? `🎁 Mr Mobiles Referral\n\nShare this link:\n${link}\n\nWhen a new customer starts Mr Mobiles through your link, the referral is recorded.`
          : "Use /refer to generate your referral link."
      });
      return;
    }

    if (data === "admin_dashboard") {
      if (!context.admins.includes(userId)) {
        await safeAnswerCallback(context, callbackQuery.id, "This action is for the Mr Mobiles support team.");
        return;
      }
      await safeAnswerCallback(context, callbackQuery.id, "Loading admin dashboard…");
      const dashboard = context.adminDashboard ? await context.adminDashboard() : null;
      if (!dashboard) {
        await context.call("sendMessage", { chat_id: chatId, text: "Admin dashboard is temporarily unavailable." });
        return;
      }
      const rows = dashboard.recentRepairs.slice(0, 5).map(ticket => [{
        text: `🛠 ${ticket.reference_code} • ${ticket.status}`,
        callback_data: `admin_ticket:${ticket.reference_code}`
      }]);
      rows.push([{ text: "🔄 Refresh", callback_data: "admin_dashboard" }]);
      await context.call("sendMessage", {
        chat_id: chatId,
        text: adminDashboardText(dashboard),
        reply_markup: { inline_keyboard: rows }
      });
      return;
    }

    if (data === "repairrush_play") {
      await safeAnswerCallback(context, callbackQuery.id);
      await context.call(context.gameUrl ? "sendGame" : "sendMessage", context.gameUrl
        ? { chat_id: chatId, game_short_name: REPAIR_RUSH_SHORT_NAME }
        : { chat_id: chatId, text: "Repair Rush is being connected. Please try again soon." });
      return;
    }

    if (data === "ai_help") {
      await safeAnswerCallback(context, callbackQuery.id, "AI assistant ready");
      await context.call("sendMessage", {
        chat_id: chatId,
        text: "🤖 Ask me naturally about phones, prices, stock, repairs or your orders. Example: 30k budget la best phone suggest pannu."
      });
      return;
    }

    if (data === "orders_latest") {
      await safeAnswerCallback(context, callbackQuery.id, "Loading your orders…");
      const orders = await context.orders(userId);
      const text = orders.length
        ? orders.slice(0, 5).map((order, i) => {
            const workflow = order.workflow_status ? ` • ${order.workflow_status}` : "";
            return `${i + 1}. #${String(order.id).slice(0, 8)} • ${formatInr(order.amount_paise)}\nPayment: ${order.status}${workflow}`;
          }).join("\n\n")
        : "You don't have any Mr Mobiles orders yet.";
      await context.call("sendMessage", { chat_id: chatId, text: `🧾 Your recent orders\n\n${text}` });
      return;
    }

    if (data === "repairs_latest") {
      await safeAnswerCallback(context, callbackQuery.id, "Loading your repair tickets…");
      const tickets = context.repairs ? await context.repairs(userId) : [];
      const text = tickets.length
        ? tickets.map((ticket, i) => `${i + 1}. ${ticket.reference_code} • ${ticket.status}\n${[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}`).join("\n\n")
        : "You don't have any Telegram repair tickets yet.";
      await context.call("sendMessage", { chat_id: chatId, text: `🛠 Your repairs\n\n${text}` });
      return;
    }

    if (data.startsWith("repair_status:")) {
      await safeAnswerCallback(context, callbackQuery.id, "Checking repair status…");
      const referenceCode = data.slice("repair_status:".length).toUpperCase();
      const ticket = /^MRR-[A-F0-9]{10}$/.test(referenceCode) && context.repairStatus
        ? await context.repairStatus(userId, referenceCode)
        : null;
      await context.call("sendMessage", {
        chat_id: chatId,
        text: ticket ? repairStatusText(ticket) : "I couldn't find that repair ticket for your Telegram account."
      });
      return;
    }

    if (data.startsWith("repair_approve:")) {
      const referenceCode = data.slice("repair_approve:".length).toUpperCase();
      const approved = /^MRR-[A-F0-9]{10}$/.test(referenceCode) && context.approveRepair
        ? await context.approveRepair(userId, referenceCode)
        : false;
      await safeAnswerCallback(
        context,
        callbackQuery.id,
        approved ? "Repair quote approved." : "This quote cannot be approved right now."
      );
      if (approved) {
        const ticket = context.repairStatus
          ? await context.repairStatus(userId, referenceCode)
          : null;
        const payUrl = new URL(versionedMiniAppUrl(context.appUrl));
        payUrl.searchParams.set("repair_ref", referenceCode);

        await context.call("sendMessage", {
          chat_id: chatId,
          text: [
            "✅ Repair quote approved",
            `Reference: ${referenceCode}`,
            typeof ticket?.quoted_amount_paise === "number"
              ? `Approved amount: ${formatInr(ticket.quoted_amount_paise)}`
              : "",
            "",
            "Pay the approved quote securely on mrmobiles.in. The amount is locked to this repair reference on the server.",
            "After confirmed payment, your repair automatically moves to in progress."
          ].filter(Boolean).join("\n"),
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Pay Repair Quote", web_app: { url: payUrl.toString() } }],
              [{ text: "📍 Track Repair", callback_data: `repair_status:${referenceCode}` }],
              [{ text: "👤 Talk to Human", callback_data: "human_support" }]
            ]
          }
        });
      }
      return;
    }

    if (data === "human_support") {
      await safeAnswerCallback(context, callbackQuery.id, "Connecting you with Mr Mobiles support…");
      const name = [callbackQuery.from.first_name, callbackQuery.from.last_name]
        .filter((value) => typeof value === "string")
        .join(" ")
        .slice(0, 160);
      const handedOff = context.handoff ? await context.handoff(userId, name || "Customer") : false;
      await context.call("sendMessage", {
        chat_id: chatId,
        text: handedOff
          ? "✅ Human support requested. The Mr Mobiles team can reply to you here."
          : "Human chat handoff is temporarily unavailable. Please use /support followed by your question or email contact@mrmobiles.in."
      });
      return;
    }

    if (data === "repair_start") {
      await safeAnswerCallback(context, callbackQuery.id, "Repair assistant ready");
      await context.call("sendMessage", {
        chat_id: chatId,
        text: "🛠️ Repair Diagnosis\n\nReply with:\n• Brand\n• Exact model\n• Problem / damage\n• Optional device photo\n\nExample: Samsung S23 — display cracked and touch not working.\n\nFinal diagnosis and price are confirmed after inspection.",
        reply_markup: {
          force_reply: true,
          input_field_placeholder: "Brand + model + problem"
        }
      });
      return;
    }

    if (data.startsWith("stock:")) {
      await safeAnswerCallback(context, callbackQuery.id, "Checking live stock…");
      const productId = data.slice("stock:".length);
      const valid = /^[A-Za-z0-9_-]{1,56}$/.test(productId);
      const products = valid && context.productsByIds ? await context.productsByIds([productId]) : [];
      const product = products[0];
      await context.call("sendMessage", {
        chat_id: chatId,
        text: product
          ? `📦 ${product.name}\nPrice: ${formatInr(product.pricePaise)}\nStock: ${stockLabel(product)}`
          : "That product is not currently available in the live Mr Mobiles catalog."
      });
      return;
    }

    if (data.startsWith("compare:")) {
      await safeAnswerCallback(context, callbackQuery.id, "Preparing comparison…");
      const ids = data.slice("compare:".length).split("~").filter((id: string) => /^[A-Za-z0-9_-]{1,56}$/.test(id)).slice(0, 2);
      const products = ids.length === 2 && context.productsByIds ? await context.productsByIds(ids) : [];
      const ordered = ids.map((id: string) => products.find((product: InlineProduct) => product.id === id)).filter(Boolean) as InlineProduct[];
      await context.call("sendMessage", {
        chat_id: chatId,
        text: ordered.length === 2
          ? `⚖️ Product Comparison\n\n${comparisonText(ordered)}\n\nThese are live catalog facts; condition-specific details are confirmed before ordering.`
          : "I couldn’t load both products for comparison. Please search again and retry."
      });
      return;
    }

    const feedbackMatch = data.match(/^feedback:(1|-1):(\d+)$/);
    if (feedbackMatch) {
      const rating = Number(feedbackMatch[1]) as 1 | -1;
      const responseId = Number(feedbackMatch[2]);
      const saved = context.feedback && Number.isSafeInteger(responseId)
        ? await context.feedback(userId, responseId, rating)
        : false;
      await safeAnswerCallback(
        context,
        callbackQuery.id,
        saved ? "Thanks — feedback saved." : "Feedback couldn’t be saved right now."
      );
      return;
    }

    await safeAnswerCallback(context, callbackQuery.id);
    return;
  }

  const inlineQuery = (update as any)?.inline_query;
  if (inlineQuery && typeof inlineQuery.id === "string" &&
      Number.isSafeInteger(inlineQuery?.from?.id) && !inlineQuery?.from?.is_bot) {
    const query = typeof inlineQuery.query === "string" ? inlineQuery.query.trim().slice(0, 100) : "";
    if (/^(repairrush|repair rush|game)$/i.test(query)) {
      await context.call("answerInlineQuery", {
        inline_query_id: inlineQuery.id,
        results: context.gameUrl ? [{ type: "game", id: REPAIR_RUSH_SHORT_NAME, game_short_name: REPAIR_RUSH_SHORT_NAME }] : [],
        cache_time: 0,
        is_personal: true
      });
      return;
    }
    const products = (await context.searchProducts(query)).slice(0, 10);
    const results = products.map((product) => {
      const viewUrl = new URL(context.appUrl);
      viewUrl.searchParams.set("category", product.category);
      viewUrl.searchParams.set("product", product.id);

      const buyUrl = new URL(viewUrl);
      buyUrl.searchParams.set("buy", "1");

      let viewTarget = viewUrl.toString();
      let buyTarget = buyUrl.toString();
      if (context.botUsername && /^[A-Za-z0-9_]{5,32}$/.test(context.botUsername)) {
        const botLink = `https://t.me/${context.botUsername}`;
        const viewDeepLink = new URL(botLink);
        viewDeepLink.searchParams.set("startapp", `view_${product.id}`.slice(0, 64));
        const buyDeepLink = new URL(botLink);
        buyDeepLink.searchParams.set("startapp", `buy_${product.id}`.slice(0, 64));
        viewTarget = viewDeepLink.toString();
        buyTarget = buyDeepLink.toString();
      }

      const price = formatInr(product.pricePaise);
      const stock = stockLabel(product);
      const identity = [product.brand, product.model].filter(Boolean).join(" • ");
      const cardUrl = product.imageUrl && /^https:\/\//i.test(product.imageUrl)
        ? product.imageUrl
        : (() => {
            const generated = new URL("/api/product-card", context.appUrl);
            generated.searchParams.set("name", product.name);
            generated.searchParams.set("price", price);
            generated.searchParams.set("stock", stock);
            generated.searchParams.set("emoji", product.emoji);
            return generated.toString();
          })();

      return {
        type: "article",
        id: `product:${product.id}`,
        title: `${product.emoji} ${product.name}`,
        description: [price, stock, identity || product.subtitle].filter(Boolean).join(" • ").slice(0, 256),
        thumbnail_url: cardUrl,
        thumbnail_width: 320,
        thumbnail_height: 180,
        input_message_content: {
          message_text: [
            `${product.emoji} ${product.name}`,
            identity,
            product.subtitle,
            `Price: ${price}`,
            `Stock: ${stock}`,
            "",
            "Mr Mobiles"
          ].filter(Boolean).join("\n")
        },
        reply_markup: {
          inline_keyboard: [[
            { text: "View Product", url: viewTarget },
            { text: "Buy Now", url: buyTarget }
          ]]
        }
      };
    });

    await context.call("answerInlineQuery", {
      inline_query_id: inlineQuery.id,
      results,
      cache_time: 15,
      is_personal: true,
      button: {
        text: "Open Mr Mobiles",
        web_app: { url: context.appUrl }
      }
    });
    return;
  }

  const message = (update as any)?.message;
  if (message && Number.isSafeInteger(message?.chat?.id) &&
      Number.isSafeInteger(message?.from?.id) && !message?.from?.is_bot) {
    const senderId = message.from.id as number;
    const replyPrompt = typeof message?.reply_to_message?.text === "string"
      ? message.reply_to_message.text
      : "";
    const targetMatch = replyPrompt.match(/^↩️ MR MOBILES reply\n(?:Reference: (MRR-[A-F0-9]{10})\n)?Customer ID: (\d+)\n/i);
    const quoteTargetMatch = replyPrompt.match(/^💰 MR MOBILES quote\nReference: (MRR-[A-F0-9]{10})\n/i);
    const assignTargetMatch = replyPrompt.match(/^👨‍🔧 MR MOBILES technician\nReference: (MRR-[A-F0-9]{10})\n/i);
    const slaTargetMatch = replyPrompt.match(/^⏱ MR MOBILES SLA\nReference: (MRR-[A-F0-9]{10})\n/i);
    const warrantyTargetMatch = replyPrompt.match(/^🛡 MR MOBILES warranty\nReference: (MRR-[A-F0-9]{10})\n/i);
    const adminReply = typeof message.text === "string" ? message.text.trim() : "";

    if (assignTargetMatch && context.admins.includes(senderId) && adminReply && !adminReply.startsWith("/")) {
      const referenceCode = assignTargetMatch[1].toUpperCase();
      const technicianName = adminReply.replace(/\s+/g, " ").slice(0, 80);
      const ok = technicianName.length >= 2 && context.repairAssign
        ? await context.repairAssign(referenceCode, technicianName)
        : false;
      await context.call("sendMessage", {
        chat_id: message.chat.id,
        text: ok ? `✅ ${referenceCode} assigned to ${technicianName}.` : "⚠️ Technician assignment failed."
      });
      return;
    }

    if (slaTargetMatch && context.admins.includes(senderId) && adminReply && !adminReply.startsWith("/")) {
      const referenceCode = slaTargetMatch[1].toUpperCase();
      const hours = Number(adminReply);
      const ok = Number.isInteger(hours) && hours >= 1 && hours <= 720 && context.repairSetSla
        ? await context.repairSetSla(referenceCode, hours)
        : false;
      await context.call("sendMessage", {
        chat_id: message.chat.id,
        text: ok ? `✅ SLA set for ${referenceCode}: ${hours} hours.` : "⚠️ SLA must be a whole number from 1 to 720 hours."
      });
      return;
    }

    if (warrantyTargetMatch && context.admins.includes(senderId) && adminReply && !adminReply.startsWith("/")) {
      const referenceCode = warrantyTargetMatch[1].toUpperCase();
      const match = adminReply.match(/^(\d{1,3})(?:\s+([\s\S]+))?$/);
      const days = Number(match?.[1]);
      const ok = match && Number.isInteger(days) && days >= 1 && days <= 730 && context.createWarranty
        ? await context.createWarranty(referenceCode, days, (match[2] || "").trim())
        : false;
      await context.call("sendMessage", {
        chat_id: message.chat.id,
        text: ok ? `✅ Warranty created for ${referenceCode}: ${days} days.` : "⚠️ Warranty requires a completed repair and 1-730 days."
      });
      return;
    }

    if (quoteTargetMatch && context.admins.includes(senderId) && adminReply && !adminReply.startsWith("/")) {
      const referenceCode = quoteTargetMatch[1].toUpperCase();
      const ticket = context.adminRepairTicket
        ? await context.adminRepairTicket(referenceCode)
        : null;
      if (context.adminRepairTicket && (!ticket || !["diagnosing", "awaiting_approval"].includes(String(ticket.status || "")))) {
        await context.call("sendMessage", {
          chat_id: message.chat.id,
          text: ticket
            ? `⚠️ ${referenceCode} is now ${ticket.status}; this quote prompt is stale. Open the repair ticket and try again.`
            : `⚠️ Repair ticket ${referenceCode} was not found.`,
          ...(ticket ? { reply_markup: adminTicketKeyboard(ticket) } : {})
        });
        return;
      }

      const quoteMatch = adminReply.match(/^(\d{2,7})(?:\s+([\s\S]+))?$/);
      const rupees = Number(quoteMatch?.[1]);

      if (!quoteMatch || !Number.isFinite(rupees) || rupees <= 0) {
        await context.call("sendMessage", {
          chat_id: message.chat.id,
          text: [
            "💰 MR MOBILES quote",
            `Reference: ${referenceCode}`,
            "",
            "Please reply with a valid amount and optional note.",
            "Example: 2500 Display replacement"
          ].join("\n"),
          reply_markup: {
            force_reply: true,
            selective: true,
            input_field_placeholder: "Amount + optional note"
          }
        });
        return;
      }

      const ok = context.repairQuote
        ? await context.repairQuote(referenceCode, Math.round(rupees * 100), (quoteMatch[2] || "").trim())
        : false;
      await context.call("sendMessage", {
        chat_id: message.chat.id,
        text: ok
          ? `✅ Quote sent for ${referenceCode}: ${formatInr(Math.round(rupees * 100))}`
          : `⚠️ Quote could not be sent for ${referenceCode}.`
      });
      return;
    }

    if (targetMatch && context.admins.includes(senderId) && adminReply && !adminReply.startsWith("/")) {
      const referenceCode = targetMatch[1] ? targetMatch[1].toUpperCase() : "";
      const target = Number(targetMatch[2]);
      if (Number.isSafeInteger(target) && target > 0 && adminReply.length <= 3000) {
        try {
          await context.call("sendMessage", {
            chat_id: target,
            text: [
              "💬 Mr Mobiles Support",
              referenceCode ? `Repair: ${referenceCode}` : "",
              "",
              adminReply
            ].filter(Boolean).join("\n")
          });
          await context.call("sendMessage", {
            chat_id: message.chat.id,
            text: `✅ Reply sent${referenceCode ? ` for ${referenceCode}` : ""} to customer ${target}.`
          });
        } catch {
          await context.call("sendMessage", {
            chat_id: message.chat.id,
            text: "The reply could not be delivered. The customer may have blocked the bot."
          });
        }
        return;
      }
    }
  }

  if (message?.chat?.type !== "private" || !Number.isSafeInteger(message?.chat?.id) ||
      !Number.isSafeInteger(message?.from?.id) || message.from.is_bot) return;

  const chatId = message.chat.id as number;
  const userId = message.from.id as number;
  const text = typeof message.text === "string"
    ? message.text.trim()
    : (typeof message.caption === "string" ? message.caption.trim() : "");
  const photoFileId = Array.isArray(message.photo) && message.photo.length
    ? message.photo[message.photo.length - 1]?.file_id
    : undefined;
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const argument = text.replace(/^\S+\s*/, "");
  if (command === "/game" || (command === "/start" && argument === REPAIR_RUSH_SHORT_NAME)) {
    await context.call(context.gameUrl ? "sendGame" : "sendMessage", context.gameUrl
      ? { chat_id: chatId, game_short_name: REPAIR_RUSH_SHORT_NAME }
      : { chat_id: chatId, text: "Repair Rush is being connected. Please try again soon." });
    return;
  }
  const isAdmin = context.admins.includes(userId);
  const send = (body: Record<string, unknown>) => context.call("sendMessage", { chat_id: chatId, ...body });
  const keyboard = (label = "Open Mr Mobiles", category?: string) => {
    const url = new URL(versionedMiniAppUrl(context.appUrl));
    if (category) url.searchParams.set("category", category);
    return { inline_keyboard: [[{ text: label, web_app: { url: url.toString() } }]] };
  };

  const repliedPrompt = typeof message?.reply_to_message?.text === "string"
    ? message.reply_to_message.text
    : "";
  const isRepairIntakeReply = repliedPrompt.startsWith("🛠️ Repair Diagnosis");

  if (isRepairIntakeReply && (text || photoFileId) && !text.startsWith("/")) {
    if (text.length < 6) {
      await send({
        text: "🛠️ Please add a caption with brand, exact model and the problem. You can attach a device photo too.\n\nExample: Samsung S23 — display cracked and touch not working.",
        reply_markup: { force_reply: true, input_field_placeholder: "Brand + model + problem" }
      });
      return;
    }

    const name = [message.from.first_name, message.from.last_name]
      .filter((value: unknown) => typeof value === "string")
      .join(" ")
      .slice(0, 160);
    const details = text.slice(0, 1200);
    const ticket = context.repairIntake
      ? await context.repairIntake(userId, name || "Customer", details, photoFileId)
      : null;

    const serviceUrl = new URL(versionedMiniAppUrl(context.appUrl));
    serviceUrl.searchParams.set("category", "service");

    await send({
      text: ticket
        ? `✅ Repair ticket created\nReference: ${ticket.referenceCode}\n\nYour details:\n${details}${ticket.aiTriage ? `\n\n🤖 Visual pre-check\n${ticket.aiTriage}` : ""}\n\nUse Track Repair anytime. Final diagnosis and repair price will be confirmed after technician inspection.`
        : `🛠️ Repair details understood\n\nYour details:\n${details}\n\nI couldn’t create the repair ticket right now. Please tap Talk to Human or try again shortly.`,
      reply_markup: {
        inline_keyboard: ticket ? [
          [{ text: "📍 Track Repair", callback_data: `repair_status:${ticket.referenceCode}` }],
          [{ text: "🛠 Browse Repair Services", web_app: { url: serviceUrl.toString() } }],
          [{ text: "👤 Talk to Human", callback_data: "human_support" }]
        ] : [
          [{ text: "👤 Talk to Human", callback_data: "human_support" }]
        ]
      }
    });
    return;
  }

  if (command === "/start" || command === "/menu") {
    if (command === "/start") {
      const websiteCart = parseWebsiteCartStartPayload(argument);
      if (websiteCart.length) {
        const resolved: Array<{ product: InlineProduct; qty: number }> = [];
        for (const item of websiteCart) {
          const searchName = websiteProductSearchName(item.websiteId);
          if (!searchName) continue;
          const matches = await context.searchProducts(searchName);
          const exact = matches.find((product) => product.name.toLowerCase() === searchName.toLowerCase()) || matches[0];
          if (exact) resolved.push({ product: exact, qty: item.qty });
        }

        if (resolved.length) {
          const cartUrl = new URL(versionedMiniAppUrl(context.appUrl));
          cartUrl.searchParams.set(
            "website_cart",
            encodeMiniAppWebsiteCart(resolved.map((item) => ({ productId: item.product.id, qty: item.qty })))
          );
          const totalPaise = resolved.reduce((sum, item) => sum + item.product.pricePaise * item.qty, 0);
          const lines = resolved.map((item, index) =>
            `${index + 1}. ${item.product.name} ×${item.qty} — ${formatInr(item.product.pricePaise * item.qty)}`
          );
          const unavailable = websiteCart.length - resolved.length;

          await send({
            text: [
              "🛒 Website cart received",
              "",
              ...lines,
              "",
              `Total: ${formatInr(totalPaise)}`,
              unavailable > 0 ? `⚠️ ${unavailable} item(s) need live availability confirmation.` : "",
              "",
              "Continue inside the Mr Mobiles Mini App to confirm stock and place/pay for the order."
            ].filter(Boolean).join("\n"),
            reply_markup: {
              inline_keyboard: [
                [{ text: "🛍 Continue Checkout", web_app: { url: cartUrl.toString() } }],
                [{ text: "📦 Check Orders", callback_data: "orders_latest" }],
                [{ text: "👤 Talk to Human", callback_data: "human_support" }]
              ]
            }
          });
          return;
        }

        await send({
          text: "🛒 I received your website cart, but those items are not currently available in the live Telegram catalog. Tap Shop or Talk to Human to continue.",
          reply_markup: homeKeyboard(context, isAdmin)
        });
        return;
      }

      const repairStart = argument.match(/^repair_(hardware|software|unlock)$/);
      if (repairStart) {
        const label: Record<string, string> = {
          hardware: "Hardware Repair",
          software: "Software Repair",
          unlock: "FRP / Unlock Service"
        };
        await send({
          text: `🛠️ ${label[repairStart[1]]}\n\nWebsite-la irundhu vandhirukeenga. Tap Start Diagnosis and send brand + exact model + problem. Final diagnosis and price technician inspection-ku apram confirm pannuvom.`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🧰 Start Diagnosis", callback_data: "repair_start" }],
              [{ text: "👤 Talk to Human", callback_data: "human_support" }]
            ]
          }
        });
        return;
      }

      if (argument === "sell") {
        await send({
          text: "♻️ Sell / Trade-in\n\nSend brand, exact model, storage, age and condition. Mr Mobiles can guide the estimate and final inspection.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🤖 Ask Trade-in AI", callback_data: "ai_help" }],
              [{ text: "👤 Talk to Human", callback_data: "human_support" }]
            ]
          }
        });
        return;
      }

      if (argument === "support") {
        await send({
          text: "👤 Mr Mobiles Support\n\nYou came from the website. Tap below and the team can continue with you here in Telegram.",
          reply_markup: { inline_keyboard: [[{ text: "Connect to Team", callback_data: "human_support" }]] }
        });
        return;
      }
    }

    let referralRecorded = false;
    const referralMatch = command === "/start" ? argument.match(/^ref_(\d+)$/) : null;
    const referrerUserId = Number(referralMatch?.[1]);
    if (referralMatch && Number.isSafeInteger(referrerUserId) && referrerUserId > 0 && referrerUserId !== userId && context.recordReferral) {
      referralRecorded = await context.recordReferral(userId, referrerUserId, "bot_start");
    }

    await send({
      text: [
        "👋 Welcome to Mr Mobiles",
        "",
        "AI shopping, live stock, orders, repairs and human support — all from this chat.",
        referralRecorded ? "🎁 Referral connected successfully." : ""
      ].filter(Boolean).join("\n"),
      reply_markup: homeKeyboard(context, isAdmin)
    });
  } else if (command === "/account") {
    const summary = context.accountSummary ? await context.accountSummary(userId) : null;
    await send({
      text: summary ? accountSummaryText(summary) : "Your account summary is temporarily unavailable.",
      reply_markup: homeKeyboard(context, isAdmin)
    });
  } else if (command === "/refer") {
    const link = referralLink(context, userId);
    await send({
      text: link
        ? `🎁 Mr Mobiles Referral\n\nShare this link:\n${link}\n\nNew customers who start the bot through this link are attributed to you.`
        : "Referral link is temporarily unavailable. Please try /refer again."
    });
  } else if (command === "/admin") {
    if (!isAdmin) {
      await send({ text: "This command is available to the Mr Mobiles support team." });
      return;
    }
    const dashboard = context.adminDashboard ? await context.adminDashboard() : null;
    if (!dashboard) {
      await send({ text: "Admin dashboard is temporarily unavailable." });
      return;
    }
    const rows = dashboard.recentRepairs.slice(0, 5).map(ticket => [{
      text: `🛠 ${ticket.reference_code} • ${ticket.status}`,
      callback_data: `admin_ticket:${ticket.reference_code}`
    }]);
    rows.push([{ text: "🔄 Refresh", callback_data: "admin_dashboard" }]);
    await send({ text: adminDashboardText(dashboard), reply_markup: { inline_keyboard: rows } });
  } else if (command === "/paysupport") {
    await send({
      text: "💳 Payment Support\n\nFor failed, pending or duplicate payments, send /support followed by the order/payment issue. Never send card numbers, CVV, OTP or banking passwords."
    });
  } else if (command === "/shop") {
    await send({ text: "📱 Browse Mr Mobiles phones and accessories:", reply_markup: keyboard("Browse Shop") });
  } else if (command === "/repair") {
    const serviceUrl = new URL(versionedMiniAppUrl(context.appUrl));
    serviceUrl.searchParams.set("category", "service");
    await send({
      text: "🛠️ Repair Help\n\nStart a guided diagnosis here. You can reply with brand/model/problem or attach a device photo with that caption. Final diagnosis and pricing are confirmed after inspection.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧰 Start Diagnosis", callback_data: "repair_start" }],
          [{ text: "🛠 Browse Repair Services", web_app: { url: serviceUrl.toString() } }]
        ]
      }
    });
  } else if (command === "/repairs") {
    const tickets = context.repairs ? await context.repairs(userId) : [];
    if (!tickets.length) {
      await send({
        text: "You don't have any Telegram repair tickets yet.",
        reply_markup: { inline_keyboard: [[{ text: "🧰 Start Diagnosis", callback_data: "repair_start" }]] }
      });
      return;
    }
    const lines = tickets.map((ticket, i) =>
      `${i + 1}. ${ticket.reference_code} • ${ticket.status}\n${[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}`
    );
    await send({ text: `🛠 Your repair tickets\n\n${lines.join("\n\n")}\n\nUse /repairstatus REFERENCE for full details.` });
  } else if (command === "/repairstatus") {
    const referenceCode = argument.trim().toUpperCase();
    if (!/^MRR-[A-F0-9]{10}$/.test(referenceCode)) {
      await send({ text: "Usage: /repairstatus MRR-XXXXXXXXXX" });
      return;
    }
    const ticket = context.repairStatus ? await context.repairStatus(userId, referenceCode) : null;
    await send({ text: ticket ? repairStatusText(ticket) : "I couldn't find that repair ticket for your Telegram account." });
  } else if (command === "/id") {
    await send({ text: `Your Telegram user ID: ${userId}\nPrivate chat ID: ${chatId}` });
  } else if (command === "/privacy") {
    await send({
      text: "🔐 AI & privacy\n\nAI questions are processed through the configured AI provider, and recent chat text is stored privately in the Mr Mobiles database to keep conversation context. Do not send passwords, OTPs, card numbers, CVVs or private credentials. Payment verification and order data remain server-side."
    });
  } else if (command === "/help") {
    const help = BOT_COMMANDS.map(c => `/${c.command} — ${c.description}`).join("\n");
    await send({ text: `${help}\n\nYou can also just type a normal question to chat with the AI assistant.${isAdmin ? "\n\nAdmin tools:\n/admin — control centre\n/reply CUSTOMER_ID message\n/repairupdate MRR-... STATUS note\n/repairquote MRR-... AMOUNT note" : ""}` });
  } else if (command === "/orders") {
    const orders = await context.orders(userId);
    if (!orders.length) {
      await send({ text: "You don't have any Mr Mobiles orders yet.", reply_markup: keyboard("Start Shopping") });
      return;
    }
    const lines = orders.slice(0, 5).map((order, i) => {
      const amount = formatInr(order.amount_paise);
      const workflow = order.workflow_status ? ` • ${order.workflow_status}` : "";
      return `${i + 1}. #${String(order.id).slice(0, 8)} • ${amount}\nPayment: ${order.status}${workflow}`;
    });
    await send({ text: `🧾 Your recent orders\n\n${lines.join("\n\n")}`, reply_markup: keyboard() });
  } else if (command === "/repairupdate") {
    if (!isAdmin) {
      await send({ text: "This command is available to the Mr Mobiles support team." });
      return;
    }
    const match = argument.match(/^(MRR-[A-F0-9]{10})\s+(received|reviewing|diagnosing|awaiting_approval|approved|repairing|ready|completed|rejected|cancelled)(?:\s+([\s\S]+))?$/i);
    if (!match) {
      await send({ text: "Usage: /repairupdate MRR-XXXXXXXXXX STATUS optional note" });
      return;
    }
    const referenceCode = match[1].toUpperCase();
    const requestedStatus = match[2].toLowerCase();
    const ticket = context.adminRepairTicket
      ? await context.adminRepairTicket(referenceCode)
      : null;

    if (context.adminRepairTicket && !ticket) {
      await send({ text: "Repair update failed or the reference was not found." });
      return;
    }
    if (context.adminRepairTicket && requestedStatus === "repairing" && ticket?.status !== "repairing") {
      await send({ text: `💳 ${referenceCode} moves to repairing only after the approved quote payment is confirmed.` });
      return;
    }

    if (ticket && requestedStatus !== ticket.status) {
      const allowedTransitions: Record<string, string[]> = {
        received: ["reviewing", "diagnosing", "rejected", "cancelled"],
        reviewing: ["diagnosing", "rejected", "cancelled"],
        diagnosing: ["rejected", "cancelled"],
        awaiting_approval: ["rejected", "cancelled"],
        approved: ["rejected", "cancelled"],
        repairing: ["ready", "cancelled"],
        ready: ["completed"],
        completed: [],
        rejected: [],
        cancelled: []
      };
      const allowed = allowedTransitions[String(ticket.status || "")] || [];
      if (!allowed.includes(requestedStatus)) {
        await send({
          text: `⚠️ ${referenceCode} cannot move from ${ticket.status} to ${requestedStatus}. Use the repair controls for the next valid step.`
        });
        return;
      }
    }

    const ok = context.repairUpdate
      ? await context.repairUpdate(referenceCode, requestedStatus, (match[3] || "").trim())
      : false;
    await send({ text: ok ? `✅ Repair ${referenceCode} updated to ${requestedStatus}.` : "Repair update failed or the reference was not found." });
  } else if (command === "/repairquote") {
    if (!isAdmin) {
      await send({ text: "This command is available to the Mr Mobiles support team." });
      return;
    }
    const match = argument.match(/^(MRR-[A-F0-9]{10})\s+(\d{2,7})(?:\s+([\s\S]+))?$/i);
    const rupees = Number(match?.[2]);
    if (!match || !Number.isFinite(rupees) || rupees <= 0) {
      await send({ text: "Usage: /repairquote MRR-XXXXXXXXXX AMOUNT optional note" });
      return;
    }
    const referenceCode = match[1].toUpperCase();
    const ticket = context.adminRepairTicket
      ? await context.adminRepairTicket(referenceCode)
      : null;
    if (context.adminRepairTicket && (!ticket || !["diagnosing", "awaiting_approval"].includes(String(ticket.status || "")))) {
      await send({
        text: ticket
          ? `⚠️ ${referenceCode} is ${ticket.status}; quote changes are allowed only while diagnosing or awaiting approval.`
          : "Repair quote failed or the reference was not found."
      });
      return;
    }

    const ok = context.repairQuote
      ? await context.repairQuote(referenceCode, Math.round(rupees * 100), (match[3] || "").trim())
      : false;
    await send({ text: ok ? `✅ Quote sent for ${referenceCode}: ${formatInr(Math.round(rupees * 100))}` : "Repair quote failed or the reference was not found." });
  } else if (command === "/reply") {
    if (!isAdmin) {
      await send({ text: "This command is available to the Mr Mobiles support team." });
      return;
    }
    const match = argument.match(/^(\d+)\s+([\s\S]+)$/);
    const target = Number(match?.[1]);
    const reply = match?.[2]?.trim();
    if (!match || !Number.isSafeInteger(target) || target <= 0 || !reply || reply.length > 3000) {
      await send({ text: "Usage: /reply CUSTOMER_ID your message\nKeep the reply under 3,000 characters." });
      return;
    }
    try {
      await context.call("sendMessage", { chat_id: target, text: `💬 Mr Mobiles Support\n\n${reply}` });
    } catch {
      await send({ text: "The reply could not be delivered. Check the customer ID and whether they have blocked the bot, then try again." });
      return;
    }
    await send({ text: `Reply sent to customer ${target}.` });
  } else if (command === "/support") {
    const question = argument;
    if (!context.supportChatId || !context.admins.length) {
      await send({ text: "💬 Mr Mobiles Support\nEmail: contact@mrmobiles.in\n\nChat forwarding is not set up right now.", reply_markup: keyboard() });
      return;
    }
    if (!question) {
      await send({
        text: "Send /support followed by your question, or tap Talk to Human below.",
        reply_markup: { inline_keyboard: [[{ text: "👤 Talk to Human", callback_data: "human_support" }]] }
      });
      return;
    }
    if (question.length > 2500) {
      await send({ text: "Please keep your support message under 2,500 characters." });
      return;
    }
    const name = [message.from.first_name, message.from.last_name].filter(v => typeof v === "string").join(" ").slice(0, 160);
    try {
      await context.call("sendMessage", {
        chat_id: context.supportChatId,
        text: `📩 Customer support request\nName: ${name || "Customer"}\nCustomer ID: ${userId}\n\n${question}`,
        reply_markup: {
          inline_keyboard: [[
            { text: "⚡ Send Default Reply", callback_data: `reply_default:${userId}` },
            { text: "✍️ Custom Reply", callback_data: `reply_customer:${userId}` }
          ]]
        }
      });
    } catch {
      await send({ text: "We could not forward your message to support right now. Please email contact@mrmobiles.in or try again later." });
      return;
    }
    await send({ text: "✅ Your message has been sent to the Mr Mobiles support team. They can reply here." });
  } else if (command === "/ai" || (text && !text.startsWith("/"))) {
    const question = command === "/ai" ? argument : text;
    if (!question) {
      await send({ text: "🤖 Ask me anything about Mr Mobiles products, stock, prices, repairs or your orders." });
      return;
    }
    if (!context.aiReply) {
      await send({ text: "The AI assistant is temporarily unavailable. Use /shop, /orders or /support.", reply_markup: keyboard() });
      return;
    }

    const rawDraftId = Number((update as any)?.update_id);
    const draftId = Number.isSafeInteger(rawDraftId) && rawDraftId !== 0
      ? Math.abs(rawDraftId)
      : Math.max(1, Date.now() % 2_000_000_000);
    let liveDraft = true;

    try {
      await context.call("sendMessageDraft", {
        chat_id: chatId,
        draft_id: draftId,
        text: "",
        can_stop: false
      });
    } catch {
      liveDraft = false;
      try {
        await context.call("sendChatAction", { chat_id: chatId, action: "typing" });
      } catch {
        // Cosmetic feedback only.
      }
    }

    const answer = await context.aiReply(userId, question, async (partial) => {
      if (!liveDraft) return;
      try {
        await context.call("sendMessageDraft", {
          chat_id: chatId,
          draft_id: draftId,
          text: partial ? `🤖 Mr Mobiles AI\n\n${partial}`.slice(0, 4096) : "",
          can_stop: false
        });
      } catch {
        liveDraft = false;
      }
    });

    await send({
      text: `🤖 Mr Mobiles AI\n\n${answer.text}`,
      reply_markup: aiKeyboard(context, answer.products, answer.responseId)
    });
  } else if (!text) {
    await send({ text: "Send a text question, or use /help to see the available commands." });
  } else {
    await send({ text: "Use /help to see the available commands.", reply_markup: keyboard() });
  }
}
