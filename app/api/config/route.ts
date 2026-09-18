import { NextResponse } from "next/server";

export async function GET() {
  const paymentsEnabled = Boolean(
    process.env.RAZORPAY_PAYMENTS_ENABLED === "true" &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );

  return NextResponse.json({ paymentsEnabled });
}
