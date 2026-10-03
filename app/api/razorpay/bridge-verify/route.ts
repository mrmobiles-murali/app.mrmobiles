import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPaymentBridgeToken } from "@/lib/payment-bridge";
import {
  captureRazorpayPayment,
  fetchRazorpayPayment,
  verifyPaymentSignature
} from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { advanceRepairAfterPaidOrder } from "@/lib/repair-payment-server";

function cleanReason(value: unknown) {
  return String(value || "Payment failed.").replace(/[\r\n\t]+/g, " ").trim().slice(0, 500);
}

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(paise || 0) / 100);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = verifyPaymentBridgeToken(String(body?.bridgeToken || ""));
    const supabase = getSupabaseAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, telegram_user_id, amount_paise, currency, razorpay_order_id, razorpay_payment_id, status, cart")
      .eq("id", token.internalOrderId)
      .eq("telegram_user_id", token.telegramUserId)
      .eq("razorpay_order_id", token.razorpayOrderId)
      .single();

    if (error || !order?.razorpay_order_id) throw new Error("Order not found.");

    if (body?.kind === "failure") {
      if (order.status !== "paid") {
        const reason = cleanReason(body?.reason);
        await supabase.from("orders").update({
          status: "payment_failed",
          workflow_status: "payment_issue",
          workflow_note: reason,
          updated_at: new Date().toISOString()
        }).eq("id", order.id);
      }
      return NextResponse.json({ ok: true, recorded: true });
    }

    const paymentId = String(body?.razorpay_payment_id || "");
    const checkoutOrderId = String(body?.razorpay_order_id || "");
    const signature = String(body?.razorpay_signature || "");

    if (!paymentId || !checkoutOrderId || !signature) {
      throw new Error("Incomplete Razorpay payment response.");
    }

    if (checkoutOrderId !== order.razorpay_order_id) {
      throw new Error("Payment order mismatch.");
    }

    if (order.status === "paid") {
      const repair = await advanceRepairAfterPaidOrder({
        telegramUserId: Number(order.telegram_user_id),
        amountPaise: Number(order.amount_paise),
        cart: order.cart
      });
      return NextResponse.json({
        ok: true,
        internalOrderId: order.id,
        paymentId: order.razorpay_payment_id || paymentId,
        alreadyVerified: true,
        repairReference: repair?.referenceCode || null
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
            workflow_note: "Payment was authorized but server capture did not complete.",
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
          ? "Razorpay reported the payment as failed."
          : `Payment status is ${payment.status || "pending"}; waiting for capture.`,
        updated_at: new Date().toISOString()
      }).eq("id", order.id);
      throw new Error(failed ? "Payment failed. Please try again." : "Payment is still processing.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        workflow_status: "confirmed",
        workflow_note: "Payment verified and captured via mrmobiles.in.",
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
      const appUrl = process.env.TELEGRAM_MINI_APP_URL || "https://app.mrmobiles.in";
      const repair = await advanceRepairAfterPaidOrder({
        telegramUserId: Number(order.telegram_user_id),
        amountPaise: Number(order.amount_paise),
        cart: order.cart
      });

      await sendTelegramMessage(
        Number(order.telegram_user_id),
        [
          "✅ <b>Payment successful</b>",
          "",
          `Amount: <b>${formatInr(Number(order.amount_paise))}</b>`,
          repair?.referenceCode ? `Repair: <code>${repair.referenceCode}</code>` : "",
          `Order: <code>${order.id}</code>`,
          `Payment: <code>${paymentId}</code>`,
          "Status: <b>Paid & confirmed</b>",
          repair?.referenceCode ? "Repair status: <b>In progress</b>" : "",
          "",
          "Securely processed via mrmobiles.in.",
          "Thank you for choosing Mr Mobiles 💙"
        ].filter(Boolean).join("\n"),
        {
          replyMarkup: {
            inline_keyboard: repair?.referenceCode
              ? [
                  [{ text: "📍 Track Repair", callback_data: `repair_status:${repair.referenceCode}` }],
                  [
                    { text: "👤 My Account", callback_data: "account_summary" },
                    { text: "🧾 Orders", callback_data: "orders_latest" }
                  ]
                ]
              : [
                  [
                    { text: "👤 My Account", callback_data: "account_summary" },
                    { text: "🧾 Orders", callback_data: "orders_latest" }
                  ],
                  [{ text: "🛍 Shop Again", web_app: { url: appUrl } }]
                ]
          }
        }
      );

      if (repair?.referenceCode) {
        const supportCandidate = process.env.TELEGRAM_SUPPORT_CHAT_ID;
        const adminCandidate = String(process.env.TELEGRAM_ADMIN_IDS || "")
          .split(",")
          .map((value) => value.trim())
          .find((value) => /^\d+$/.test(value));
        const supportChatId = /^-?\d+$/.test(String(supportCandidate || ""))
          ? Number(supportCandidate)
          : adminCandidate
            ? Number(adminCandidate)
            : null;

        if (supportChatId && supportChatId !== Number(order.telegram_user_id)) {
          try {
            await sendTelegramMessage(
              supportChatId,
              [
                "💳 <b>Repair payment received</b>",
                `Repair: <code>${repair.referenceCode}</code>`,
                `Amount: <b>${formatInr(Number(order.amount_paise))}</b>`,
                `Order: <code>${order.id}</code>`,
                `Payment: <code>${paymentId}</code>`,
                repair.advanced ? "Workflow: <b>moved to repairing</b>" : `Workflow: <b>${repair.status || "confirmed"}</b>`
              ].join("\n")
            );
          } catch {
            // Payment and repair state remain authoritative if admin notification is unavailable.
          }
        }
      }
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
