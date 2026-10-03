import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import {
  captureRazorpayPayment,
  fetchRazorpayPayment,
  verifyPaymentSignature
} from "@/lib/razorpay";
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
      await supabase.from("orders").update({
        status: "signature_failed",
        workflow_status: "payment_issue",
        workflow_note: "Payment signature verification failed.",
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw new Error("Payment signature verification failed.");
    }

    let payment = await fetchRazorpayPayment(paymentId);

    const paymentMatchesOrder = (candidate: typeof payment) =>
      candidate.order_id === order.razorpay_order_id &&
      Number(candidate.amount) === Number(order.amount_paise) &&
      String(candidate.currency || "").toUpperCase() === String(order.currency || "INR").toUpperCase();

    if (!paymentMatchesOrder(payment)) {
      await supabase.from("orders").update({
        status: "payment_mismatch",
        workflow_status: "payment_issue",
        workflow_note: "Payment details did not match the order.",
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw new Error("Payment details did not match the order.");
    }

    let captured = payment.status === "captured" || payment.captured === true;

    if (!captured && payment.status === "authorized") {
      try {
        payment = await captureRazorpayPayment({
          paymentId,
          amountPaise: Number(order.amount_paise),
          currency: String(order.currency || "INR")
        });
      } catch (captureError) {
        const refreshed = await fetchRazorpayPayment(paymentId);
        if (paymentMatchesOrder(refreshed) && (refreshed.status === "captured" || refreshed.captured === true)) {
          payment = refreshed;
        } else {
          await supabase.from("orders").update({
            status: "payment_capture_failed",
            workflow_status: "payment_issue",
            workflow_note: "Payment was authorized but server capture did not complete. Retry status refresh or contact support.",
            updated_at: new Date().toISOString()
          }).eq("id", order.id);
          throw captureError;
        }
      }
      captured = paymentMatchesOrder(payment) && (payment.status === "captured" || payment.captured === true);
    }

    if (!captured) {
      const failed = payment.status === "failed";
      await supabase.from("orders").update({
        status: failed ? "payment_failed" : "payment_pending",
        workflow_status: failed ? "payment_issue" : "payment_processing",
        workflow_note: failed
          ? "Razorpay reported the payment as failed. Retry checkout or contact support."
          : `Payment status is ${payment.status || "pending"}; waiting for a captured payment.`,
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw new Error(
        failed
          ? "Payment failed. Please try again or use /support."
          : "Payment is still processing. Reopen the Mini App shortly to refresh the status."
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        workflow_status: "confirmed",
        workflow_note: "Payment verified and captured.",
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
