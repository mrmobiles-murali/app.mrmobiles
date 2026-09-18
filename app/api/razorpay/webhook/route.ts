import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { addWorkflowEvent } from "@/lib/web-automation";

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
      .select("id, telegram_user_id, source, tracking_code, status, razorpay_payment_id")
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
            workflow_status: order.source === "web" ? "confirmed" : "new",
            razorpay_payment_id: paymentId || order.razorpay_payment_id,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", order.id)
          .neq("status", "paid");

        if (updateError) throw new Error(updateError.message);

        if (order.source === "web" && order.tracking_code) {
          await addWorkflowEvent({
            entityType: "order",
            entityId: order.id,
            referenceCode: order.tracking_code,
            status: "confirmed",
            message: "Payment received. Your order is confirmed."
          });
        }

        if (order.telegram_user_id) {
          await sendTelegramMessage(
            Number(order.telegram_user_id),
            `✅ <b>Payment received</b>\nOrder: <code>${order.id}</code>${paymentId ? `\nPayment: <code>${paymentId}</code>` : ""}\n\nThank you for choosing Mr Mobiles.`
          );
        }
      }
    }

    if (event === "payment.failed" && order.status !== "paid") {
      await supabase
        .from("orders")
        .update({
          status: "payment_failed",
          workflow_status: order.source === "web" ? "payment_issue" : "new",
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id);

      if (order.source === "web" && order.tracking_code) {
        await addWorkflowEvent({
          entityType: "order",
          entityId: order.id,
          referenceCode: order.tracking_code,
          status: "payment_issue",
          message: "Payment failed. Please try again or contact Mr Mobiles."
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    const status = message.includes("RAZORPAY_WEBHOOK_SECRET") ? 503 : 400;
    return NextResponse.json({ ok: false }, { status });
  }
}
