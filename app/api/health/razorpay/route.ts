import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    razorpayKeyId: Boolean(process.env.RAZORPAY_KEY_ID),
    razorpayKeySecret: Boolean(process.env.RAZORPAY_KEY_SECRET),
    razorpayWebhookSecret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET)
  });
}
