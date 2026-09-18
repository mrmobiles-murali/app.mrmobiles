import { NextResponse } from "next/server";

async function configureMenu() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "Bot token missing" }, { status: 500 });

  const response = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Shop Mr Mobiles",
        web_app: { url: "https://appmrmobiles.vercel.app" }
      }
    }),
    cache: "no-store"
  });

  const data = await response.json();
  return NextResponse.json({
    ok: response.ok && Boolean(data?.ok),
    description: data?.description || null
  }, { status: response.ok ? 200 : 400 });
}

export async function GET() { return configureMenu(); }
export async function POST() { return configureMenu(); }
