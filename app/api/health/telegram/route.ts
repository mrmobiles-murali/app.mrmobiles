import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    telegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN)
  });
}
