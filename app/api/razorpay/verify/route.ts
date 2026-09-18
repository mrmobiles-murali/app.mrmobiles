import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { verifyPaymentSignature } from "@/lib/razorpay";
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
      .select("id, telegram_user_id, amount_paise, razorpay_order_id, status")
      .eq("razorpay_order_id", checkoutOrderId)
      .eq("telegram_user_id", user.id)
      .single();

    if (error || !order?.razorpay_order_id) {
      throw new Error("Order not found.");
    }

    const valid = verifyPaymentSignature({
      serverOrderId: order.razorpay_order_id,
      paymentId,
      signature
    });

    if (!valid) {
      await supabase.from("orders").update({ status: "signature_failed" }).eq("id", order.id);
      throw new Error("Payment signature verification failed.");
    }

    await supabase
      .from("orders")
      .update({
        status: "paid",
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString()
      })
      .eq("id", order.id);

    await sendTelegramMessage(
      user.id,
      `✅ <b>Payment received</b>\nOrder: <code>${order.id}</code>\nPayment: <code>${paymentId}</code>\n\nThank you for choosing Mr Mobiles.`
    );

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
