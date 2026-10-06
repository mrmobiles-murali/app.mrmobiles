import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { addWorkflowEvent } from "@/lib/web-automation";
import {
  advanceRepairAfterPaidOrder,
  repairPaymentWorkflowIsActive
} from "@/lib/repair-payment-server";

function monitorRecipients() {
  const admins = String(process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  const support = String(process.env.TELEGRAM_SUPPORT_CHAT_ID || "").trim();
  const supportId = /^-?\d+$/.test(support) ? Number(support) : undefined;
  return [...new Set([...(supportId ? [supportId] : []), ...admins])];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function money(amountPaise: unknown, currency = "INR") {
  const amount = Number(amountPaise || 0) / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: String(currency || "INR").toUpperCase()
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currency || "INR").toUpperCase()}`;
  }
}

function maskedRef(value: unknown) {
  const text = String(value || "");
  if (!text) return "—";
  return text.length <= 8 ? text : `…${text.slice(-8)}`;
}

function monitorLog(event: string, details: Record<string, unknown> = {}) {
  console.info("[razorpay-monitor]", JSON.stringify({
    event,
    at: new Date().toISOString(),
    ...details
  }));
}

async function notifyMonitorAdmins(lines: string[]) {
  const recipients = monitorRecipients();
  if (!recipients.length) return;
  await Promise.allSettled(
    recipients.map((chatId) =>
      sendTelegramMessage(chatId, lines.filter(Boolean).join("\n"))
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";

    if (!verifyWebhookSignature(rawBody, signature)) {
      monitorLog("webhook.invalid_signature");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = String(payload?.event || "");

    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const settlementEntity = payload?.payload?.settlement?.entity;
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
    const paymentId = paymentEntity?.id || refundEntity?.payment_id || null;

    if (event === "payment.failed") {
      monitorLog(event, {
        order: maskedRef(razorpayOrderId),
        payment: maskedRef(paymentEntity?.id),
        amountPaise: Number(paymentEntity?.amount || 0),
        method: String(paymentEntity?.method || ""),
        errorCode: String(paymentEntity?.error_code || "")
      });
      await notifyMonitorAdmins([
        "🚨 <b>Razorpay payment failed</b>",
        `Amount: <b>${escapeHtml(money(paymentEntity?.amount, paymentEntity?.currency))}</b>`,
        `Method: <b>${escapeHtml(paymentEntity?.method || "unknown")}</b>`,
        `Order: <code>${escapeHtml(maskedRef(razorpayOrderId))}</code>`,
        `Payment: <code>${escapeHtml(maskedRef(paymentEntity?.id))}</code>`,
        paymentEntity?.error_description
          ? `Reason: ${escapeHtml(paymentEntity.error_description)}`
          : ""
      ]);
    }

    if (event === "payment.captured" || event === "order.paid") {
      monitorLog(event, {
        order: maskedRef(razorpayOrderId),
        payment: maskedRef(paymentEntity?.id),
        amountPaise: Number(paymentEntity?.amount || orderEntity?.amount_paid || 0)
      });
    }

    if (event === "refund.created" || event === "refund.processed" || event === "refund.failed") {
      monitorLog(event, {
        refund: maskedRef(refundEntity?.id),
        payment: maskedRef(refundEntity?.payment_id),
        amountPaise: Number(refundEntity?.amount || 0),
        status: String(refundEntity?.status || "")
      });
      await notifyMonitorAdmins([
        event === "refund.failed"
          ? "🚨 <b>Razorpay refund failed</b>"
          : event === "refund.processed"
            ? "↩️ <b>Razorpay refund processed</b>"
            : "↩️ <b>Razorpay refund created</b>",
        `Amount: <b>${escapeHtml(money(refundEntity?.amount, refundEntity?.currency))}</b>`,
        `Refund: <code>${escapeHtml(maskedRef(refundEntity?.id))}</code>`,
        `Payment: <code>${escapeHtml(maskedRef(refundEntity?.payment_id))}</code>`
      ]);
    }

    if (event === "settlement.processed") {
      monitorLog(event, {
        settlement: maskedRef(settlementEntity?.id),
        amountPaise: Number(settlementEntity?.amount || 0),
        status: String(settlementEntity?.status || "processed")
      });
      await notifyMonitorAdmins([
        "🏦 <b>Razorpay settlement processed</b>",
        `Amount: <b>${escapeHtml(money(settlementEntity?.amount, settlementEntity?.currency))}</b>`,
        `Settlement: <code>${escapeHtml(maskedRef(settlementEntity?.id))}</code>`
      ]);
    }

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase
      .from("orders")
      .select("id, telegram_user_id, source, tracking_code, status, razorpay_payment_id, amount_paise, cart")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (!order) {
      monitorLog("order.not_found", { event, order: maskedRef(razorpayOrderId) });
      return NextResponse.json({ ok: true });
    }

    if (event === "order.paid" || event === "payment.captured") {
      let transitioned = false;

      if (order.status !== "paid") {
        const { data: updated, error: updateError } = await supabase
          .from("orders")
          .update({
            status: "paid",
            workflow_status: "confirmed",
            razorpay_payment_id: paymentId || order.razorpay_payment_id,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", order.id)
          .neq("status", "paid")
          .select("id")
          .maybeSingle();

        if (updateError) throw new Error(updateError.message);
        transitioned = Boolean(updated);

        if (transitioned && order.source === "web" && order.tracking_code) {
          await addWorkflowEvent({
            entityType: "order",
            entityId: order.id,
            referenceCode: order.tracking_code,
            status: "confirmed",
            message: "Payment received. Your order is confirmed."
          });
        }
      }

      const repair = order.telegram_user_id
        ? await advanceRepairAfterPaidOrder({
            telegramUserId: Number(order.telegram_user_id),
            amountPaise: Number(order.amount_paise || 0),
            cart: order.cart
          })
        : null;

      if (transitioned && order.telegram_user_id) {
        await sendTelegramMessage(
          Number(order.telegram_user_id),
          [
            "✅ <b>Payment received</b>",
            repair?.referenceCode ? `Repair: <code>${repair.referenceCode}</code>` : "",
            `Order: <code>${order.id}</code>`,
            paymentId ? `Payment: <code>${paymentId}</code>` : "",
            "Status: <b>confirmed</b>",
            repairPaymentWorkflowIsActive(repair)
              ? "Repair status: <b>In progress</b>"
              : repair?.referenceCode
                ? "Repair status: <b>Payment confirmed; workflow sync pending</b>"
                : "",
            "",
            "Use /orders anytime to check your order. Thank you for choosing Mr Mobiles."
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

    if (event === "payment.failed" && order.status !== "paid") {
      await supabase
        .from("orders")
        .update({
          status: "payment_failed",
          workflow_status: "payment_issue",
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

      if (order.telegram_user_id) {
        try {
          await sendTelegramMessage(
            Number(order.telegram_user_id),
            `⚠️ <b>Payment not completed</b>\nOrder: <code>${order.id}</code>\nStatus: payment issue\n\nYou can retry checkout or use /support if you need help. No order is marked paid until server verification succeeds.`
          );
        } catch {
          // Payment state is already stored; notification delivery is best effort.
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    monitorLog("webhook.error", { message });
    const status = message.includes("RAZORPAY_WEBHOOK_SECRET") ? 503 : 400;
    return NextResponse.json({ ok: false }, { status });
  }
}
