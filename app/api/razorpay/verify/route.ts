import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { fetchRazorpayPayment, verifyPaymentSignature } from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);

    const body = await request.json();
    const paymentId = String(body?.razorpay_payment_id || "");
    const checkoutOrderId = String(body?.razorpay_order_id || "");
    const signature = String(body?.razorpay_signature || "");

    if (!paymentId || !checkoutOrderId || !signature) {
      throw new Error("Incomplete Razorpay payment response.");
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, telegram_user_id, amount_paise, currency, razorpay_order_id, razorpay_payment_id, status")
      .eq("razorpay_order_id", checkoutOrderId)
      .eq("telegram_user_id", user.id)
      .single();

    if (error || !order?.razorpay_order_id) throw new Error("Order not found.");

    if (order.status === "paid") {
      return NextResponse.json({
        ok: true,
        internalOrderId: order.id,
        paymentId: order.razorpay_payment_id || paymentId,
        alreadyVerified: true
      });
    }

    const validSignature = verifyPaymentSignature({
      serverOrderId: order.razorpay_order_id,
      paymentId,
      signature
    });

    if (!validSignature) {
      await supabase.from("orders").update({ status: "signature_failed" }).eq("id", order.id);
      throw new Error("Payment signature verification failed.");
    }

    const payment = await fetchRazorpayPayment(paymentId);
    const captured = payment.status === "captured" || payment.captured === true;

    if (
      payment.order_id !== order.razorpay_order_id ||
      Number(payment.amount) !== Number(order.amount_paise) ||
      String(payment.currency || "").toUpperCase() !== String(order.currency || "INR").toUpperCase()
    ) {
      await supabase.from("orders").update({ status: "payment_mismatch" }).eq("id", order.id);
      throw new Error("Payment details did not match the order.");
    }

    if (!captured) {
      await supabase.from("orders").update({ status: "payment_authorized" }).eq("id", order.id);
      throw new Error("Payment is not captured yet. Reopen the Mini App shortly to refresh the status.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString()
      })
      .eq("id", order.id)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);

    if (updated) {
      await sendTelegramMessage(
        user.id,
        `✅ <b>Payment received</b>\nOrder: <code>${order.id}</code>\nPayment: <code>${paymentId}</code>\n\nThank you for choosing Mr Mobiles.`
      );
    }

    return NextResponse.json({
      ok: true,
      internalOrderId: order.id,
      paymentId
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Payment verification failed." },
      { status: 400 }
    );
  }
}
