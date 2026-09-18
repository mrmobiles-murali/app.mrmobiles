import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { fetchRazorpayOrderPayments } from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);
    const supabase = getSupabaseAdmin();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, telegram_user_id, amount_paise, currency, razorpay_order_id, status")
      .eq("telegram_user_id", user.id)
      .neq("status", "paid")
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    let reconciled = 0;
    const paidOrderIds: string[] = [];

    for (const order of orders || []) {
      if (!order.razorpay_order_id) continue;

      const payments = await fetchRazorpayOrderPayments(order.razorpay_order_id);
      const captured = payments.find((payment) =>
        (payment.status === "captured" || payment.captured === true) &&
        payment.order_id === order.razorpay_order_id &&
        Number(payment.amount) === Number(order.amount_paise) &&
        String(payment.currency || "").toUpperCase() === String(order.currency || "INR").toUpperCase()
      );

      if (!captured) continue;

      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "paid",
          razorpay_payment_id: captured.id,
          paid_at: new Date().toISOString()
        })
        .eq("id", order.id)
        .neq("status", "paid")
        .select("id")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);

      if (updated) {
        reconciled += 1;
        paidOrderIds.push(order.id);
        await sendTelegramMessage(
          user.id,
          `✅ <b>Payment confirmed</b>\nOrder: <code>${order.id}</code>\nPayment: <code>${captured.id}</code>\n\nThank you for choosing Mr Mobiles.`
        );
      }
    }

    return NextResponse.json({ ok: true, reconciled, paidOrderIds });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not refresh payment status." },
      { status: 400 }
    );
  }
}
