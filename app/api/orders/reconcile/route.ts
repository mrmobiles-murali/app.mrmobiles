import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import {
  captureRazorpayPayment,
  fetchRazorpayOrderPayments,
  type RazorpayPayment
} from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import {
  advanceRepairAfterPaidOrder,
  repairPaymentWorkflowIsActive
} from "@/lib/repair-payment-server";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);
    const supabase = getSupabaseAdmin();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, telegram_user_id, amount_paise, currency, razorpay_order_id, status, cart")
      .eq("telegram_user_id", user.id)
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    let reconciled = 0;
    let repairsAdvanced = 0;
    const paidOrderIds: string[] = [];

    for (const order of orders || []) {
      if (!order.razorpay_order_id) continue;

      if (order.status === "paid") {
        const repair = await advanceRepairAfterPaidOrder({
          telegramUserId: user.id,
          amountPaise: Number(order.amount_paise),
          cart: order.cart
        });
        if (repair?.advanced) repairsAdvanced += 1;
        continue;
      }

      const matchesOrder = (payment: RazorpayPayment) =>
        payment.order_id === order.razorpay_order_id &&
        Number(payment.amount) === Number(order.amount_paise) &&
        String(payment.currency || "").toUpperCase() === String(order.currency || "INR").toUpperCase();

      let payments = await fetchRazorpayOrderPayments(order.razorpay_order_id);
      let captured = payments.find((payment) =>
        matchesOrder(payment) &&
        (payment.status === "captured" || payment.captured === true)
      );

      if (!captured) {
        const authorized = payments.find((payment) =>
          matchesOrder(payment) && payment.status === "authorized"
        );

        if (authorized) {
          try {
            const captureResult = await captureRazorpayPayment({
              paymentId: authorized.id,
              amountPaise: Number(order.amount_paise),
              currency: String(order.currency || "INR")
            });
            if (
              matchesOrder(captureResult) &&
              (captureResult.status === "captured" || captureResult.captured === true)
            ) {
              captured = captureResult;
            }
          } catch {
            payments = await fetchRazorpayOrderPayments(order.razorpay_order_id);
            captured = payments.find((payment) =>
              matchesOrder(payment) &&
              (payment.status === "captured" || payment.captured === true)
            );
          }
        }
      }

      if (!captured) continue;

      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "paid",
          workflow_status: "confirmed",
          workflow_note: "Payment reconciled from Razorpay capture.",
          razorpay_payment_id: captured.id,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id)
        .neq("status", "paid")
        .select("id")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);

      if (updated) {
        reconciled += 1;
        paidOrderIds.push(order.id);
        const repair = await advanceRepairAfterPaidOrder({
          telegramUserId: user.id,
          amountPaise: Number(order.amount_paise),
          cart: order.cart
        });
        await sendTelegramMessage(
          user.id,
          [
            "✅ <b>Payment confirmed</b>",
            `Amount: <b>${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(order.amount_paise) / 100)}</b>`,
            repair?.referenceCode ? `Repair: <code>${repair.referenceCode}</code>` : "",
            `Order: <code>${order.id}</code>`,
            `Payment: <code>${captured.id}</code>`,
            repairPaymentWorkflowIsActive(repair)
              ? "Repair status: <b>In progress</b>"
              : repair?.referenceCode
                ? "Repair status: <b>Payment confirmed; workflow sync pending</b>"
                : "",
            "",
            "Thank you for choosing Mr Mobiles."
          ].filter(Boolean).join("\n"),
          repair?.referenceCode ? {
            replyMarkup: {
              inline_keyboard: [
                [{ text: "📍 Track Repair", callback_data: `repair_status:${repair.referenceCode}` }],
                [{ text: "👤 My Account", callback_data: "account_summary" }]
              ]
            }
          } : undefined
        );
      }
    }

    return NextResponse.json({ ok: true, reconciled, repairsAdvanced, paidOrderIds });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not refresh payment status." },
      { status: 400 }
    );
  }
}
