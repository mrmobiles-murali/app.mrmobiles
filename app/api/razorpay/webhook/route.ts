import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/razorpay";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";

    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = String(payload?.event || "");

    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const razorpayOrderId =
      paymentEntity?.order_id ||
      orderEntity?.id ||
      null;

    const paymentId = paymentEntity?.id || null;

    if (razorpayOrderId) {
      const supabase = getSupabaseAdmin();

      if (event === "order.paid" || event === "payment.captured") {
        await supabase
          .from("orders")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId,
            paid_at: new Date().toISOString()
          })
          .eq("razorpay_order_id", razorpayOrderId);
      }

      if (event === "payment.failed") {
        await supabase
          .from("orders")
          .update({ status: "payment_failed" })
          .eq("razorpay_order_id", razorpayOrderId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
