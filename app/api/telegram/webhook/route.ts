import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const MINI_APP_URL = "https://appmrmobiles.vercel.app";

function webhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

async function telegram(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const data = await response.json();
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.description || "Telegram API error");
  }
  return data.result;
}

function webAppKeyboard(label = "Open Mr Mobiles") {
  return {
    inline_keyboard: [[
      {
        text: label,
        web_app: { url: MINI_APP_URL }
      }
    ]]
  };
}

export async function POST(request: NextRequest) {
  try {
    const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (incomingSecret !== webhookSecret()) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();
    const message = update?.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = Number(message.chat.id);
    const text = String(message.text || "").trim();
    const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

    if (command === "/start") {
      await telegram("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          "👋 <b>Welcome to Mr Mobiles</b>\n\nBrowse phones, accessories and repair services directly inside Telegram.",
        reply_markup: webAppKeyboard()
      });
    } else if (command === "/shop") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "📱 Open the Mr Mobiles shop:",
        reply_markup: webAppKeyboard("Browse Shop")
      });
    } else if (command === "/repair") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "🛠️ Open Mr Mobiles to choose a repair service:",
        reply_markup: webAppKeyboard("Book Repair")
      });
    } else if (command === "/orders") {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("orders")
        .select("id, amount_paise, status, created_at")
        .eq("telegram_user_id", chatId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw new Error(error.message);

      if (!data?.length) {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "You don't have any Mr Mobiles orders yet.",
          reply_markup: webAppKeyboard("Start Shopping")
        });
      } else {
        const lines = data.map((order: any, index: number) => {
          const amount = new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
          }).format(Number(order.amount_paise) / 100);
          const shortId = String(order.id).slice(0, 8);
          return `${index + 1}. #${shortId} • ${amount} • ${order.status}`;
        });

        await telegram("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `🧾 <b>Your recent orders</b>\n\n${lines.join("\n")}`,
          reply_markup: webAppKeyboard()
        });
      }
    } else if (command === "/support") {
      await telegram("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          "💬 <b>Mr Mobiles Support</b>\nOpen the Mini App for shop and service options. You can also send your question in this chat.",
        reply_markup: webAppKeyboard()
      });
    } else {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Use the menu below to open Mr Mobiles.",
        reply_markup: webAppKeyboard()
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
