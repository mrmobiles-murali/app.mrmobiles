import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";

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
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
    const paymentId = paymentEntity?.id || null;

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase
      .from("orders")
      .select("id, telegram_user_id, status, razorpay_payment_id")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ ok: true });
    }

    if (event === "order.paid" || event === "payment.captured") {
      if (order.status !== "paid") {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId || order.razorpay_payment_id,
            paid_at: new Date().toISOString()
          })
          .eq("id", order.id)
          .neq("status", "paid");

        if (updateError) throw new Error(updateError.message);

        await sendTelegramMessage(
          Number(order.telegram_user_id),
          `✅ <b>Payment received</b>\nOrder: <code>${order.id}</code>${paymentId ? `\nPayment: <code>${paymentId}</code>` : ""}\n\nThank you for choosing Mr Mobiles.`
        );
      }
    }

    if (event === "payment.failed" && order.status !== "paid") {
      await supabase
        .from("orders")
        .update({ status: "payment_failed" })
        .eq("id", order.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    const status = message.includes("RAZORPAY_WEBHOOK_SECRET") ? 503 : 400;
    return NextResponse.json({ ok: false }, { status });
  }
}
