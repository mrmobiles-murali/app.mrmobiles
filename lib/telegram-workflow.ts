import crypto from "node:crypto";

export const BOT_WORKFLOW_VERSION = "2026-09-26.1";
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome and open Mr Mobiles" },
  { command: "shop", description: "Browse phones and accessories" },
  { command: "repair", description: "Browse repair services" },
  { command: "orders", description: "View your recent orders" },
  { command: "support", description: "Contact the Mr Mobiles team" },
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

export function adminIds(value = ""): number[] {
  return [...new Set(value.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s))
    .map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}

export type RecentOrder = {
  id: string; amount_paise: number; status: string; workflow_status?: string;
};
export type TelegramCall = (method: string, body: Record<string, unknown>) => Promise<unknown>;
export type BotContext = {
  appUrl: string;
  admins: number[];
  supportChatId?: number;
  call: TelegramCall;
  orders: (userId: number) => Promise<RecentOrder[]>;
};

export async function handleBotUpdate(update: unknown, context: BotContext): Promise<void> {
  const message = (update as any)?.message;
  // Keep customer orders and admin tools out of groups.
  if (message?.chat?.type !== "private" || !Number.isSafeInteger(message?.chat?.id) ||
      !Number.isSafeInteger(message?.from?.id) || message.from.is_bot) return;
  const chatId = message.chat.id as number;
  const userId = message.from.id as number;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const argument = text.replace(/^\S+\s*/, "");
  const isAdmin = context.admins.includes(userId);
  const send = (body: Record<string, unknown>) => context.call("sendMessage", { chat_id: chatId, ...body });
  const keyboard = (label = "Open Mr Mobiles", category?: string) => {
    const url = new URL(context.appUrl);
    if (category) url.searchParams.set("category", category);
    return { inline_keyboard: [[{ text: label, web_app: { url: url.toString() } }]] };
  };
  if (command === "/start") {
    await send({ text: "👋 Welcome to Mr Mobiles\n\nBrowse phones, accessories and repair services. Use /orders for your recent orders or /support followed by your question to contact our team.", reply_markup: keyboard() });
  } else if (command === "/shop") {
    await send({ text: "📱 Browse Mr Mobiles phones and accessories:", reply_markup: keyboard("Browse Shop") });
  } else if (command === "/repair") {
    await send({ text: "🛠️ Browse repair services. Final repair work and pricing are confirmed after diagnosis.", reply_markup: keyboard("Repair Services", "service") });
  } else if (command === "/id") {
    await send({ text: `Your Telegram user ID: ${userId}\nPrivate chat ID: ${chatId}` });
  } else if (command === "/help") {
    const help = BOT_COMMANDS.map(c => `/${c.command} — ${c.description}`).join("\n");
    await send({ text: `${help}\n\nSupport: /support followed by your question.${isAdmin ? "\n\nAdmin reply: /reply CUSTOMER_ID your message" : ""}` });
  } else if (command === "/orders") {
    const orders = await context.orders(userId);
    if (!orders.length) {
      await send({ text: "You don't have any Mr Mobiles orders yet.", reply_markup: keyboard("Start Shopping") });
      return;
    }
    const lines = orders.slice(0, 5).map((order, i) => {
      const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(order.amount_paise) / 100);
      const workflow = order.workflow_status ? ` • ${order.workflow_status}` : "";
      return `${i + 1}. #${String(order.id).slice(0, 8)} • ${amount}\nPayment: ${order.status}${workflow}`;
    });
    await send({ text: `🧾 Your recent orders\n\n${lines.join("\n\n")}`, reply_markup: keyboard() });
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
  } else if (command === "/support" || (text && !text.startsWith("/"))) {
    const question = command === "/support" ? argument : text;
    if (!context.supportChatId || !context.admins.length) {
      await send({ text: "💬 Mr Mobiles Support\nEmail: contact@mrmobiles.in\n\nChat forwarding is not set up yet. Please email your question to reach the team.", reply_markup: keyboard() });
      return;
    }
    if (!question) {
      await send({ text: "Send /support followed by your question. Include your device model or order ID. Your message and Telegram user ID will be shared with the Mr Mobiles support team." });
      return;
    }
    if (isAdmin) {
      await send({ text: "To answer a customer, use /reply CUSTOMER_ID your message. Use /help to see all commands." });
      return;
    }
    if (question.length > 2500) {
      await send({ text: "Please keep your support message under 2,500 characters." });
      return;
    }
    const name = [message.from.first_name, message.from.last_name].filter(v => typeof v === "string").join(" ").slice(0, 160);
    // Plain text avoids interpreting customer content as HTML.
    try {
      await context.call("sendMessage", {
        chat_id: context.supportChatId,
        text: `📩 Customer support request\nName: ${name || "Customer"}\nCustomer ID: ${userId}\n\n${question}\n\nReply in your private chat with the bot:\n/reply ${userId} your message`
      });
    } catch {
      await send({ text: "We could not forward your message to support right now. Please email contact@mrmobiles.in or try again later." });
      return;
    }
    await send({ text: "✅ Your message has been sent to the Mr Mobiles support team. They can reply here." });
  } else if (!text) {
    await send({ text: "Please send your question as text using /support, including your device model or order ID." });
  } else {
    await send({ text: "Use /help to see the available commands.", reply_markup: keyboard() });
  }
}
