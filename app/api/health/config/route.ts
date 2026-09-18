import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    telegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    razorpayKeyId: Boolean(process.env.RAZORPAY_KEY_ID),
    razorpayKeySecret: Boolean(process.env.RAZORPAY_KEY_SECRET),
    razorpayWebhookSecret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET)
  });
}
