import crypto from "node:crypto";

export const BOT_WORKFLOW_VERSION = "2026-09-27.7";
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome and open Mr Mobiles" },
  { command: "menu", description: "Open the Mr Mobiles control menu" },
  { command: "ai", description: "Ask the Mr Mobiles AI assistant" },
  { command: "shop", description: "Browse phones and accessories" },
  { command: "repair", description: "Start repair help" },
  { command: "repairs", description: "View your repair tickets" },
  { command: "repairstatus", description: "Track a repair reference" },
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
  repairIntake?: (userId: number, name: string, details: string) => Promise<{ referenceCode: string } | null>;
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
  const url = new URL(appUrl);
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

  rows.push([{ text: "🛍 Open Shop", web_app: { url: context.appUrl } }]);
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

function homeKeyboard(context: BotContext) {
  return {
    inline_keyboard: [
      [
        { text: "🛍 Shop", web_app: { url: context.appUrl } },
        { text: "🤖 AI Help", callback_data: "ai_help" }
      ],
      [
        { text: "🧾 Orders", callback_data: "orders_latest" },
        { text: "🛠 Repairs", callback_data: "repairs_latest" }
      ],
      [
        { text: "👤 Human Support", callback_data: "human_support" }
      ]
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
  if (callbackQuery && typeof callbackQuery.id === "string" &&
      Number.isSafeInteger(callbackQuery?.from?.id) && !callbackQuery?.from?.is_bot &&
      callbackQuery?.message?.chat?.type === "private" &&
      Number.isSafeInteger(callbackQuery?.message?.chat?.id)) {
    const userId = callbackQuery.from.id as number;
    const chatId = callbackQuery.message.chat.id as number;
    const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";

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
        await context.call("sendMessage", {
          chat_id: chatId,
          text: `✅ Repair quote approved\nReference: ${referenceCode}\n\nMr Mobiles can now continue the repair workflow.`
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
        text: "🛠️ Repair Diagnosis\n\nReply with:\n• Brand\n• Exact model\n• Problem / damage\n\nExample: Samsung S23 — display cracked and touch not working.\n\nFinal diagnosis and price are confirmed after inspection.",
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

  const repliedPrompt = typeof message?.reply_to_message?.text === "string"
    ? message.reply_to_message.text
    : "";
  const isRepairIntakeReply = repliedPrompt.startsWith("🛠️ Repair Diagnosis");

  if (isRepairIntakeReply && text && !text.startsWith("/")) {
    if (text.length < 6) {
      await send({
        text: "🛠️ Please send a little more detail — brand, exact model and the problem.\n\nExample: Samsung S23 — display cracked and touch not working.",
        reply_markup: { force_reply: true, input_field_placeholder: "Brand + model + problem" }
      });
      return;
    }

    const name = [message.from.first_name, message.from.last_name]
      .filter((value: unknown) => typeof value === "string")
      .join(" ")
      .slice(0, 160);
    const details = text.slice(0, 1200);
    const submitted = context.repairIntake
      ? await context.repairIntake(userId, name || "Customer", details)
      : false;

    const serviceUrl = new URL(context.appUrl);
    serviceUrl.searchParams.set("category", "service");

    await send({
      text: submitted
        ? `✅ Repair details received\n\nYour details:\n${details}\n\nMr Mobiles repair team can reply to you here. Final diagnosis and repair price will be confirmed after inspection.`
        : `🛠️ Repair details understood\n\nYour details:\n${details}\n\nI couldn’t forward this to the repair team right now. Please tap Talk to Human or try again shortly.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛠 Browse Repair Services", web_app: { url: serviceUrl.toString() } }],
          [{ text: "👤 Talk to Human", callback_data: "human_support" }]
        ]
      }
    });
    return;
  }

  if (command === "/start") {
    await send({
      text: "👋 Welcome to Mr Mobiles\n\nI’m your Mr Mobiles AI assistant. Ask naturally about phones, prices, stock, repairs or orders. I use live shop data where available, and human support is always one tap away.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍 Open Mr Mobiles", web_app: { url: context.appUrl } }],
          [{ text: "🛠 Repair Help", callback_data: "repair_start" }, { text: "👤 Talk to Human", callback_data: "human_support" }]
        ]
      }
    });
  } else if (command === "/shop") {
    await send({ text: "📱 Browse Mr Mobiles phones and accessories:", reply_markup: keyboard("Browse Shop") });
  } else if (command === "/repair") {
    const serviceUrl = new URL(context.appUrl);
    serviceUrl.searchParams.set("category", "service");
    await send({
      text: "🛠️ Repair Help\n\nStart a guided diagnosis here, or browse repair services in the Mini App. Final repair work and pricing are confirmed after inspection.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧰 Start Diagnosis", callback_data: "repair_start" }],
          [{ text: "🛠 Browse Repair Services", web_app: { url: serviceUrl.toString() } }]
        ]
      }
    });
  } else if (command === "/id") {
    await send({ text: `Your Telegram user ID: ${userId}\nPrivate chat ID: ${chatId}` });
  } else if (command === "/privacy") {
    await send({
      text: "🔐 AI & privacy\n\nAI questions are processed through the configured AI provider, and recent chat text is stored privately in the Mr Mobiles database to keep conversation context. Do not send passwords, OTPs, card numbers, CVVs or private credentials. Payment verification and order data remain server-side."
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
