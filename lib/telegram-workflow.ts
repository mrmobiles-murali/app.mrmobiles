import crypto from "node:crypto";

export const BOT_WORKFLOW_VERSION = "2026-09-27.4";
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome and open Mr Mobiles" },
  { command: "ai", description: "Ask the Mr Mobiles AI assistant" },
  { command: "shop", description: "Browse phones and accessories" },
  { command: "repair", description: "Browse repair services" },
  { command: "orders", description: "View your recent orders" },
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

export function adminIds(value = ""): number[] {
  return [...new Set(value.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s))
    .map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
}

export type RecentOrder = {
  id: string; amount_paise: number; status: string; workflow_status?: string;
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
};
export type TelegramCall = (method: string, body: Record<string, unknown>) => Promise<unknown>;
export type BotContext = {
  appUrl: string;
  admins: number[];
  supportChatId?: number;
  botUsername?: string;
  call: TelegramCall;
  orders: (userId: number) => Promise<RecentOrder[]>;
  searchProducts: (query: string) => Promise<InlineProduct[]>;
  aiReply?: (userId: number, message: string) => Promise<AiAssistantReply>;
  handoff?: (userId: number, name: string) => Promise<boolean>;
};

function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(paise) / 100);
}

function productWebAppUrl(appUrl: string, product: InlineProduct, buy = false) {
  const url = new URL(appUrl);
  url.searchParams.set("category", product.category);
  url.searchParams.set("product", product.id);
  if (buy) url.searchParams.set("buy", "1");
  return url.toString();
}

function aiKeyboard(context: BotContext, products: InlineProduct[]) {
  const rows: Array<Array<Record<string, unknown>>> = [];
  for (const product of products.slice(0, 2)) {
    const shortName = product.name.length > 22 ? product.name.slice(0, 19) + "…" : product.name;
    rows.push([
      { text: `👀 ${shortName}`, web_app: { url: productWebAppUrl(context.appUrl, product) } },
      { text: "🛒 Buy", web_app: { url: productWebAppUrl(context.appUrl, product, true) } }
    ]);
  }
  rows.push([
    { text: "🛍 Open Shop", web_app: { url: context.appUrl } },
    { text: "👤 Talk to Human", callback_data: "human_support" }
  ]);
  return { inline_keyboard: rows };
}

export async function handleBotUpdate(update: unknown, context: BotContext): Promise<void> {
  const callbackQuery = (update as any)?.callback_query;
  if (callbackQuery && typeof callbackQuery.id === "string" &&
      Number.isSafeInteger(callbackQuery?.from?.id) && !callbackQuery?.from?.is_bot &&
      callbackQuery?.message?.chat?.type === "private" &&
      Number.isSafeInteger(callbackQuery?.message?.chat?.id)) {
    const userId = callbackQuery.from.id as number;
    const chatId = callbackQuery.message.chat.id as number;
    const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";

    if (data === "human_support") {
      try {
        await context.call("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Connecting you with Mr Mobiles support…"
        });
      } catch {
        // The support handoff can still continue if the visual acknowledgement fails.
      }

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
    }
    return;
  }

  const inlineQuery = (update as any)?.inline_query;
  if (inlineQuery && typeof inlineQuery.id === "string" &&
      Number.isSafeInteger(inlineQuery?.from?.id) && !inlineQuery?.from?.is_bot) {
    const query = typeof inlineQuery.query === "string" ? inlineQuery.query.trim().slice(0, 100) : "";
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
      const stock = typeof product.stockQty === "number"
        ? `${product.stockQty} in stock`
        : "Confirm stock";
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
  // Keep customer orders, AI history and admin tools out of groups.
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
    await send({
      text: "👋 Welcome to Mr Mobiles\n\nI’m your Mr Mobiles AI assistant. Ask me naturally about phones, prices, stock, repairs or orders. I use live shop data where available, and you can switch to human support anytime.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍 Open Mr Mobiles", web_app: { url: context.appUrl } }],
          [{ text: "👤 Talk to Human", callback_data: "human_support" }]
        ]
      }
    });
  } else if (command === "/shop") {
    await send({ text: "📱 Browse Mr Mobiles phones and accessories:", reply_markup: keyboard("Browse Shop") });
  } else if (command === "/repair") {
    await send({ text: "🛠️ Browse repair services. Final repair work and pricing are confirmed after diagnosis.", reply_markup: keyboard("Repair Services", "service") });
  } else if (command === "/id") {
    await send({ text: `Your Telegram user ID: ${userId}\nPrivate chat ID: ${chatId}` });
  } else if (command === "/privacy") {
    await send({
      text: "🔐 AI & privacy\n\nAI questions are processed by the configured AI provider through Vercel AI Gateway, and recent chat text is stored privately in the Mr Mobiles database to keep conversation context. Do not send passwords, OTPs, card numbers, CVVs, API keys or bot tokens. Payment verification and order data remain server-side."
    });
  } else if (command === "/help") {
    const help = BOT_COMMANDS.map(c => `/${c.command} — ${c.description}`).join("\n");
    await send({ text: `${help}\n\nYou can also just type a normal question to chat with the AI assistant.${isAdmin ? "\n\nAdmin reply: /reply CUSTOMER_ID your message" : ""}` });
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
      await send({ text: "Send /support followed by your question, or tap Talk to Human below.", reply_markup: { inline_keyboard: [[{ text: "👤 Talk to Human", callback_data: "human_support" }]] } });
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
        text: `📩 Customer support request\nName: ${name || "Customer"}\nCustomer ID: ${userId}\n\n${question}\n\nReply in your private chat with the bot:\n/reply ${userId} your message`
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
    try {
      await context.call("sendChatAction", { chat_id: chatId, action: "typing" });
    } catch {
      // Typing feedback is cosmetic; continue with the answer.
    }
    const answer = await context.aiReply(userId, question);
    await send({
      text: `🤖 Mr Mobiles AI\n\n${answer.text}`,
      reply_markup: aiKeyboard(context, answer.products)
    });
  } else if (!text) {
    await send({ text: "Send a text question, or use /help to see the available commands." });
  } else {
    await send({ text: "Use /help to see the available commands.", reply_markup: keyboard() });
  }
}
