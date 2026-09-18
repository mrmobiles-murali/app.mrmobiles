import { NextResponse } from "next/server";

export async function GET() {
  const credentialsReady = Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );

  const paymentsEnabled =
    credentialsReady &&
    process.env.RAZORPAY_PAYMENTS_ENABLED !== "false";

  return NextResponse.json({
    paymentsEnabled,
    credentialsReady
  });
}
