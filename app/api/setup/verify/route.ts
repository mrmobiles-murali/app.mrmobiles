import { NextRequest, NextResponse } from "next/server";

const VERIFY_KEY = "mm-verify-2026-k7p2";

async function telegram(method: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.description || "Telegram API error");
  }
  return data.result;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("key") !== VERIFY_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const [me, commands, menu, webhook, description] = await Promise.all([
      telegram("getMe"),
      telegram("getMyCommands"),
      telegram("getChatMenuButton"),
      telegram("getWebhookInfo"),
      telegram("getMyDescription")
    ]);

    return NextResponse.json({
      ok: true,
      bot: {
        username: me.username,
        name: me.first_name
      },
      commands,
      menuButton: {
        type: menu?.type,
        text: menu?.text,
        url: menu?.web_app?.url
      },
      webhook: {
        url: webhook?.url,
        pendingUpdateCount: webhook?.pending_update_count ?? 0,
        lastErrorMessage: webhook?.last_error_message ?? null
      },
      description: description?.description ?? ""
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Verify failed" },
      { status: 500 }
    );
  }
}
